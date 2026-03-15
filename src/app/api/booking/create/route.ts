import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase';
import { stripe } from '@/lib/stripe';
import { findOrCreateGuest } from '@/lib/guests';
import { sendBookingConfirmationEmail } from '@/lib/communications/send-templated';
import { getAvailableSlots, computeAvailability, fetchEngineInput } from '@/lib/availability';
import type { VenueForAvailability, BookingForAvailability } from '@/types/availability';
import { resolveDuration, getDayOfWeek } from '@/lib/availability/engine';
import { generateConfirmToken, hashConfirmToken } from '@/lib/confirm-token';
import { z } from 'zod';

import { autoAssignTable } from '@/lib/table-availability';
import { resolveVenueMode } from '@/lib/venue-mode';
import { syncTableStatusesForBooking } from '@/lib/table-management/lifecycle';

const createBookingSchema = z.object({
  venue_id: z.string().uuid(),
  booking_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  booking_time: z.string().regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$/),
  party_size: z.number().int().min(1).max(50),
  name: z.string().min(1).max(200),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().min(1).max(30),
  dietary_notes: z.string().max(1000).optional(),
  occasion: z.string().max(200).optional(),
  source: z.enum(['online', 'phone', 'walk-in', 'widget', 'booking_page']),
  service_id: z.string().uuid().optional(),
});

/** Compute cancellation_deadline: booking datetime minus 48 hours (Europe/London). */
function cancellationDeadline(bookingDate: string, bookingTime: string): string {
  const [y, m, d] = bookingDate.split('-').map(Number);
  const [hh, mm] = bookingTime.slice(0, 5).split(':').map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d!, hh, mm, 0));
  dt.setHours(dt.getHours() - 48);
  return dt.toISOString();
}

/**
 * POST /api/booking/create
 * Public. Creates guest (or matches), creates booking. If deposit required for source,
 * creates Stripe PaymentIntent on venue's connected account and returns client_secret.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = createBookingSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const {
      venue_id,
      booking_date,
      booking_time,
      party_size,
      name,
      email,
      phone,
      dietary_notes,
      occasion,
      source,
      service_id: requestServiceId,
    } = parsed.data;

    const supabase = getSupabaseAdminClient();

    const { data: venue, error: venueErr } = await supabase
      .from('venues')
      .select('id, name, stripe_connected_account_id, booking_rules, deposit_config, opening_hours, availability_config, timezone, table_management_enabled, show_table_in_confirmation, address')
      .eq('id', venue_id)
      .single();

    if (venueErr || !venue) {
      return NextResponse.json({ error: 'Venue not found' }, { status: 404 });
    }

    const venueMode = await resolveVenueMode(supabase, venue_id);
    const useServiceEngine = venueMode.availabilityEngine === 'service';

    if (useServiceEngine) {
      const { data: restrictions } = await supabase
        .from('booking_restrictions')
        .select('min_party_size_online, max_party_size_online')
        .eq('venue_id', venue_id)
        .limit(1)
        .maybeSingle();

      const minParty = restrictions?.min_party_size_online ?? 1;
      const maxParty = restrictions?.max_party_size_online ?? 50;
      if (party_size < minParty || party_size > maxParty) {
        return NextResponse.json(
          { error: `Party size must be between ${minParty} and ${maxParty}` },
          { status: 400 }
        );
      }
    } else {
      const rules = (venue.booking_rules as { min_party_size?: number; max_party_size?: number }) ?? {};
      const minParty = rules.min_party_size ?? 1;
      const maxParty = rules.max_party_size ?? 50;
      if (party_size < minParty || party_size > maxParty) {
        return NextResponse.json(
          { error: `Party size must be between ${minParty} and ${maxParty}` },
          { status: 400 }
        );
      }
    }

    const depositConfig = (venue.deposit_config as { enabled?: boolean; amount_per_person_gbp?: number; online_requires_deposit?: boolean; phone_requires_deposit?: boolean; min_party_size_for_deposit?: number; weekend_only?: boolean }) ?? {};

    const timeForDb = booking_time.length === 5 ? booking_time + ':00' : booking_time;
    const timeStr = timeForDb.slice(0, 5);

    let resolvedServiceId: string | null = requestServiceId ?? null;
    let estimatedEndTime: string | null = null;
    let requiresDeposit = false;
    let depositAmountPence: number | null = null;

    if (useServiceEngine) {
      const engineInput = await fetchEngineInput({
        supabase,
        venueId: venue_id,
        date: booking_date,
        partySize: party_size,
      });

      const results = computeAvailability(engineInput);
      const allSlots = results.flatMap((r) => r.slots);
      const slot = allSlots.find((s) => s.start_time === timeStr && (!requestServiceId || s.service_id === requestServiceId));

      if (!slot || slot.available_covers < party_size) {
        const alternatives = allSlots
          .filter((s) => s.available_covers >= party_size)
          .slice(0, 3)
          .map((s) => ({ time: s.start_time, service: s.service_name, service_id: s.service_id }));

        return NextResponse.json(
          { error: 'This time slot is no longer available', alternatives },
          { status: 409 }
        );
      }

      resolvedServiceId = slot.service_id;
      const engineDow = getDayOfWeek(booking_date);
      const duration = resolveDuration(engineInput.durations, slot.service_id, party_size, engineDow);
      const [y, mo, d] = booking_date.split('-').map(Number);
      const [hh, mm] = timeStr.split(':').map(Number);
      const endDate = new Date(Date.UTC(y!, mo! - 1, d!, hh!, mm!, 0));
      endDate.setMinutes(endDate.getMinutes() + duration);
      estimatedEndTime = endDate.toISOString();

      const isOnlineSource = source === 'online' || source === 'widget' || source === 'booking_page';
      const channelRequires =
        (isOnlineSource && (depositConfig.online_requires_deposit !== false)) ||
        (source === 'phone' && (depositConfig.phone_requires_deposit ?? false));

      if (slot.deposit_required && channelRequires) {
        requiresDeposit = true;
        const amountPerPerson = depositConfig.amount_per_person_gbp ?? 5;
        depositAmountPence = Math.round(amountPerPerson * party_size * 100);
      }
    } else {
      const depositEnabled = depositConfig.enabled ?? false;
      const amountPerPersonGbp = depositConfig.amount_per_person_gbp ?? 5;
      const onlineRequiresDeposit = depositConfig.online_requires_deposit !== false;
      const phoneRequiresDeposit = depositConfig.phone_requires_deposit ?? false;
      const minPartySizeForDeposit = depositConfig.min_party_size_for_deposit;
      const weekendOnly = depositConfig.weekend_only ?? false;

      const isOnlineSource = source === 'online' || source === 'widget' || source === 'booking_page';
      const channelRequires =
        (isOnlineSource && onlineRequiresDeposit) ||
        (source === 'phone' && phoneRequiresDeposit);

      const partySizeMet = !minPartySizeForDeposit || party_size >= minPartySizeForDeposit;
      const dayOfWeek = new Date(booking_date + 'T12:00:00').getDay();
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 5 || dayOfWeek === 6;
      const weekendMet = !weekendOnly || isWeekend;

      requiresDeposit = depositEnabled && channelRequires && partySizeMet && weekendMet;
      depositAmountPence = requiresDeposit ? Math.round(amountPerPersonGbp * party_size * 100) : null;
    }

    if (requiresDeposit && !venue.stripe_connected_account_id) {
      return NextResponse.json(
        { error: 'Venue has not set up payments; deposits are required for this booking type.' },
        { status: 400 }
      );
    }

    if (!useServiceEngine) {
      const { data: existingBookings } = await supabase
        .from('bookings')
        .select('id, booking_date, booking_time, party_size, status')
        .eq('venue_id', venue_id)
        .eq('booking_date', booking_date);

      const venueForAvail: VenueForAvailability = {
        id: venue.id,
        opening_hours: venue.opening_hours,
        availability_config: venue.availability_config,
        timezone: venue.timezone ?? 'Europe/London',
      };
      const bookingsForAvail: BookingForAvailability[] = (existingBookings ?? []).map((b: { id: string; booking_date: string; booking_time: string; party_size: number; status: string }) => ({
        id: b.id,
        booking_date: b.booking_date,
        booking_time: typeof b.booking_time === 'string' ? b.booking_time.slice(0, 5) : '',
        party_size: b.party_size,
        status: b.status,
      }));
      const slots = getAvailableSlots(venueForAvail, booking_date, bookingsForAvail);
      const slot = slots.find((s) => s.start_time === timeStr || s.key === timeStr);
      if (!slot || slot.available_covers < party_size) {
        return NextResponse.json(
          { error: 'This time slot is no longer available' },
          { status: 409 }
        );
      }
    }

    const { guest } = await findOrCreateGuest(supabase, venue_id, {
      name,
      email: email || null,
      phone,
    });

    const cancellation_deadline = cancellationDeadline(booking_date, booking_time);

    const cancellationPolicySnapshot = {
      refund_window_hours: 48,
      policy: 'Full refund if cancelled 48+ hours before reservation. No refund within 48 hours or for no-shows.',
    };

    const bookingInsert: Record<string, unknown> = {
      venue_id,
      guest_id: guest.id,
      booking_date,
      booking_time: timeForDb,
      party_size,
      status: requiresDeposit ? 'Pending' : 'Confirmed',
      source,
      dietary_notes: dietary_notes || null,
      occasion: occasion || null,
      deposit_amount_pence: depositAmountPence,
      deposit_status: requiresDeposit ? 'Pending' : 'Not Required',
      cancellation_deadline,
      cancellation_policy_snapshot: cancellationPolicySnapshot,
      service_id: resolvedServiceId,
      estimated_end_time: estimatedEndTime,
    };

    const { data: booking, error: bookErr } = await supabase
      .from('bookings')
      .insert(bookingInsert)
      .select('id, status, deposit_status')
      .single();

    if (bookErr) {
      console.error('Booking insert failed:', bookErr);
      return NextResponse.json({ error: 'Failed to create booking' }, { status: 500 });
    }

    let assignedTableLabel: string | null = null;
    if (venueMode.tableManagementEnabled && useServiceEngine && estimatedEndTime) {
      const durationMs = new Date(estimatedEndTime).getTime() - new Date(`${booking_date}T${timeForDb}`).getTime();
      const durationMins = Math.round(durationMs / 60000);
      const defaultRule = await supabase
        .from('service_capacity_rules')
        .select('buffer_minutes')
        .eq('service_id', resolvedServiceId!)
        .is('day_of_week', null)
        .is('time_range_start', null)
        .limit(1)
        .maybeSingle();

      const bufferMins = defaultRule?.data?.buffer_minutes ?? 15;

      const assigned = await autoAssignTable(
        supabase,
        venue_id,
        booking.id,
        booking_date,
        timeStr,
        durationMins,
        bufferMins,
        party_size,
      );
      if (assigned) {
        assignedTableLabel = assigned.table_names.join(' + ');
        await syncTableStatusesForBooking(
          supabase,
          booking.id,
          assigned.table_ids,
          booking.status,
          null
        );
      }
    }

    let client_secret: string | null = null;

    if (requiresDeposit && depositAmountPence != null && depositAmountPence > 0 && venue.stripe_connected_account_id) {
      try {
        const paymentIntent = await stripe.paymentIntents.create(
          {
            amount: depositAmountPence,
            currency: 'gbp',
            metadata: { booking_id: booking.id, venue_id },
            automatic_payment_methods: { enabled: true },
          },
          { stripeAccount: venue.stripe_connected_account_id }
        );
        client_secret = paymentIntent.client_secret;

        await supabase
          .from('bookings')
          .update({
            stripe_payment_intent_id: paymentIntent.id,
            updated_at: new Date().toISOString(),
          })
          .eq('id', booking.id);
      } catch (stripeErr) {
        console.error('PaymentIntent create failed:', stripeErr);
        await supabase.from('bookings').delete().eq('id', booking.id);
        return NextResponse.json({ error: 'Payment setup failed' }, { status: 500 });
      }
    }

    if (!requiresDeposit) {
      const manageToken = generateConfirmToken();
      await supabase
        .from('bookings')
        .update({
          confirm_token_hash: hashConfirmToken(manageToken),
          updated_at: new Date().toISOString(),
        })
        .eq('id', booking.id);
      const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : request.nextUrl.origin);
      const manageBookingLink = `${baseUrl}/manage/${booking.id}/${encodeURIComponent(manageToken)}`;
      if (guest.email) {
        sendBookingConfirmationEmail(
          {
            id: booking.id, guest_name: name, guest_email: guest.email,
            booking_date, booking_time, party_size,
            dietary_notes: dietary_notes ?? null,
            deposit_amount_pence: depositAmountPence ?? null,
            deposit_status: requiresDeposit ? 'Pending' : 'Not Required',
            manage_booking_link: manageBookingLink,
          },
          { name: venue.name, address: venue.address ?? undefined },
          venue.id,
        ).catch((err) => console.error('Templated confirmation email failed:', err));
      }
    }

    return NextResponse.json(
      {
        booking_id: booking.id,
        requires_deposit: requiresDeposit,
        client_secret: client_secret ?? undefined,
        stripe_account_id: requiresDeposit ? venue.stripe_connected_account_id : undefined,
        status: booking.status,
      },
      { status: 201 }
    );
  } catch (err) {
    console.error('POST /api/booking/create failed:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
