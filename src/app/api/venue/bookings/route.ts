import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getVenueStaff } from '@/lib/venue-auth';
import { getSupabaseAdminClient } from '@/lib/supabase';
import { stripe } from '@/lib/stripe';
import { findOrCreateGuest } from '@/lib/guests';
import { generateConfirmToken, hashConfirmToken } from '@/lib/confirm-token';

import { sendBookingConfirmationEmail, sendDepositRequestSms } from '@/lib/communications/send-templated';
import { autoAssignTable } from '@/lib/table-availability';
import { computeAvailability, fetchEngineInput, getAvailableSlots } from '@/lib/availability';
import type { BookingForAvailability, VenueForAvailability } from '@/types/availability';
import { resolveVenueMode } from '@/lib/venue-mode';
import { syncTableStatusesForBooking } from '@/lib/table-management/lifecycle';
import { z } from 'zod';
import { createHmac } from 'crypto';

const phoneBookingSchema = z.object({
  booking_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  booking_time: z.string().regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$/),
  party_size: z.number().int().min(1).max(50),
  name: z.string().min(1).max(200),
  phone: z.string().min(1).max(30),
  email: z.string().email().optional().or(z.literal('')),
  dietary_notes: z.string().max(500).optional(),
  occasion: z.string().max(200).optional(),
  special_requests: z.string().max(500).optional(),
  require_deposit: z.boolean().optional(),
});

function cancellationDeadline(bookingDate: string, bookingTime: string): string {
  const [y, m, d] = bookingDate.split('-').map(Number);
  const [hh, mm] = bookingTime.slice(0, 5).split(':').map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d!, hh, mm, 0));
  dt.setHours(dt.getHours() - 48);
  return dt.toISOString();
}

/** Create a signed payment URL token (booking_id + 24h expiry). */
function createPaymentToken(bookingId: string): string {
  const secret = process.env.PAYMENT_TOKEN_SECRET || process.env.STRIPE_SECRET_KEY || 'dev-secret';
  const exp = Date.now() + 24 * 60 * 60 * 1000;
  const payload = `${bookingId}:${exp}`;
  const sig = createHmac('sha256', secret).update(payload).digest('base64url');
  return Buffer.from(payload).toString('base64url') + '.' + sig;
}

/**
 * POST /api/venue/bookings — create a phone booking (staff). Status Pending, deposit Pending.
 * Returns payment_url if deposit required (stub: log SMS send).
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const staff = await getVenueStaff(supabase);
    if (!staff) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    }

    const body = await request.json();
    const parsed = phoneBookingSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const {
      booking_date,
      booking_time,
      party_size,
      name,
      phone,
      email,
      dietary_notes,
      occasion,
      special_requests,
      require_deposit,
    } = parsed.data;
    const venueId = staff.venue_id;
    const admin = getSupabaseAdminClient();

    const { data: venue } = await admin
      .from('venues')
      .select('id, name, stripe_connected_account_id, booking_rules, deposit_config, table_management_enabled, show_table_in_confirmation, opening_hours, availability_config, timezone, address')
      .eq('id', venueId)
      .single();

    if (!venue) {
      return NextResponse.json({ error: 'Venue not found' }, { status: 404 });
    }

    const depositConfig = (venue.deposit_config as { enabled?: boolean; amount_per_person_gbp?: number; phone_requires_deposit?: boolean }) ?? {};
    // Staff can override via the require_deposit toggle. If not provided, fall back to venue config.
    const requiresDeposit = require_deposit ?? (depositConfig.enabled && depositConfig.phone_requires_deposit);
    const amountPerPersonGbp = depositConfig.amount_per_person_gbp ?? 5;
    const depositAmountPence = requiresDeposit ? Math.round(amountPerPersonGbp * party_size * 100) : null;

    const { guest } = await findOrCreateGuest(admin, venueId, { name, email: email || null, phone });
    const timeForDb = booking_time.length === 5 ? booking_time + ':00' : booking_time;
    const timeStr = timeForDb.slice(0, 5);
    const venueMode = await resolveVenueMode(admin, venueId);

    if (venueMode.availabilityEngine === 'service') {
      const engineInput = await fetchEngineInput({
        supabase: admin,
        venueId,
        date: booking_date,
        partySize: party_size,
      });
      const slots = computeAvailability(engineInput).flatMap((result) => result.slots);
      const slot = slots.find((s) => s.start_time === timeStr);
      if (!slot || slot.available_covers < party_size) {
        return NextResponse.json({ error: 'Selected time is not available' }, { status: 409 });
      }
    } else {
      const { data: existingBookings } = await admin
        .from('bookings')
        .select('id, booking_date, booking_time, party_size, status')
        .eq('venue_id', venueId)
        .eq('booking_date', booking_date);

      const venueForAvail: VenueForAvailability = {
        id: venue.id,
        opening_hours: venue.opening_hours,
        availability_config: venue.availability_config,
        timezone: venue.timezone ?? 'Europe/London',
      };
      const bookingsForAvail: BookingForAvailability[] = (existingBookings ?? []).map((b) => ({
        id: b.id,
        booking_date: b.booking_date,
        booking_time: typeof b.booking_time === 'string' ? b.booking_time.slice(0, 5) : '00:00',
        party_size: b.party_size,
        status: b.status,
      }));
      const slots = getAvailableSlots(venueForAvail, booking_date, bookingsForAvail);
      const slot = slots.find((s) => s.start_time === timeStr || s.key === timeStr);
      if (!slot || slot.available_covers < party_size) {
        return NextResponse.json({ error: 'Selected time is not available' }, { status: 409 });
      }
    }

    if (requiresDeposit && !venue.stripe_connected_account_id) {
      return NextResponse.json(
        { error: 'Venue has not set up payments; deposits are required for this booking type.' },
        { status: 400 }
      );
    }

    const bookingInsert = {
      venue_id: venueId,
      guest_id: guest.id,
      booking_date,
      booking_time: timeForDb,
      party_size,
      status: requiresDeposit ? 'Pending' : 'Confirmed',
      source: 'phone',
      deposit_amount_pence: depositAmountPence,
      deposit_status: requiresDeposit ? ('Pending' as const) : ('Not Required' as const),
      cancellation_deadline: cancellationDeadline(booking_date, booking_time),
      dietary_notes: dietary_notes?.trim() || null,
      occasion: occasion?.trim() || null,
      special_requests: special_requests?.trim() || null,
    };

    const { data: booking, error: bookErr } = await admin
      .from('bookings')
      .insert(bookingInsert)
      .select('id')
      .single();

    if (bookErr) {
      console.error('Phone booking insert failed:', bookErr);
      return NextResponse.json({ error: 'Failed to create booking' }, { status: 500 });
    }

    let assignedTableLabel: string | null = null;
    if (venueMode.tableManagementEnabled && venueMode.availabilityEngine === 'service') {
      let durationMins = 90;
      let bufferMins = 15;
      try {
        const timeStr = booking_time.slice(0, 5);
        const dayOfWeek = new Date(booking_date).getDay();
        const { data: svcRules } = await admin
          .from('venue_services')
          .select('id, service_capacity_rules(buffer_minutes), party_size_durations(min_party_size, max_party_size, duration_minutes)')
          .eq('venue_id', venueId)
          .eq('is_active', true)
          .lte('start_time', timeStr + ':00')
          .gte('end_time', timeStr + ':00');

        const matchingSvc = (svcRules ?? []).find((s: Record<string, unknown>) => {
          const days = (s as Record<string, unknown>).active_days as number[] | undefined;
          return !days || days.includes(dayOfWeek);
        }) ?? (svcRules ?? [])[0];

        if (matchingSvc) {
          const durations = (matchingSvc as Record<string, unknown>).party_size_durations as Array<{ min_party_size: number; max_party_size: number; duration_minutes: number }> | undefined;
          const match = durations?.find((d) => party_size >= d.min_party_size && party_size <= d.max_party_size);
          if (match) durationMins = match.duration_minutes;

          const capRules = (matchingSvc as Record<string, unknown>).service_capacity_rules as Array<{ buffer_minutes?: number }> | undefined;
          if (capRules?.[0]?.buffer_minutes) bufferMins = capRules[0].buffer_minutes;
        }
      } catch (err) {
        console.error('Duration lookup failed, using defaults:', err);
      }

      const assigned = await autoAssignTable(
        admin,
        venueId,
        booking.id,
        booking_date,
        booking_time.slice(0, 5),
        durationMins,
        bufferMins,
        party_size,
      );
      if (assigned) {
        assignedTableLabel = assigned.table_names.join(' + ');
        await syncTableStatusesForBooking(
          admin,
          booking.id,
          assigned.table_ids,
          bookingInsert.status,
          staff.id
        );
      }
    }

    let payment_url: string | undefined;

    if (requiresDeposit && depositAmountPence != null && depositAmountPence > 0 && venue.stripe_connected_account_id) {
      try {
        const paymentIntent = await stripe.paymentIntents.create(
          {
            amount: depositAmountPence,
            currency: 'gbp',
            metadata: { booking_id: booking.id, venue_id: venueId },
            automatic_payment_methods: { enabled: true },
          },
          { stripeAccount: venue.stripe_connected_account_id }
        );

        await admin
          .from('bookings')
          .update({
            stripe_payment_intent_id: paymentIntent.id,
            updated_at: new Date().toISOString(),
          })
          .eq('id', booking.id);

        const token = createPaymentToken(booking.id);
        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : request.nextUrl.origin);
        payment_url = `${baseUrl}/pay?t=${token}`;
      } catch (stripeErr) {
        console.error('PaymentIntent create failed for phone booking:', stripeErr);
        await admin.from('bookings').delete().eq('id', booking.id);
        return NextResponse.json({ error: 'Payment setup failed' }, { status: 500 });
      }

      if (guest.phone) {
        sendDepositRequestSms(
          { id: booking.id, guest_name: name, booking_date, booking_time, party_size, deposit_amount_pence: depositAmountPence ?? null },
          { name: venue.name, address: venue.address ?? undefined },
          venueId,
          payment_url,
          guest.phone,
        ).catch((err) => console.error('Templated deposit SMS failed:', err));
      }
    } else {
      const manageToken = generateConfirmToken();
      await admin
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
            special_requests: special_requests ?? null,
            dietary_notes: dietary_notes ?? null,
            manage_booking_link: manageBookingLink,
          },
          { name: venue.name, address: venue.address ?? undefined },
          venueId,
        ).catch((err) => console.error('Templated confirmation email failed:', err));
      }
    }

    return NextResponse.json(
      {
        booking_id: booking.id,
        payment_url: payment_url ?? undefined,
        message: payment_url ? 'Booking created. Deposit link sent to guest (stub: check logs).' : 'Booking created.',
      },
      { status: 201 }
    );
  } catch (err) {
    console.error('POST /api/venue/bookings failed:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
