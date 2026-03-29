import { NextRequest, NextResponse, after } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase';
import { stripe } from '@/lib/stripe';
import { findOrCreateGuest } from '@/lib/guests';
import { sendBookingConfirmationEmail } from '@/lib/communications/send-templated';
import { computeAvailability, fetchEngineInput } from '@/lib/availability';
import { AVAILABILITY_SETUP_REQUIRED_MESSAGE } from '@/lib/availability/availability-errors';
import { resolveDuration, getDayOfWeek } from '@/lib/availability/engine';
import { generateConfirmToken, hashConfirmToken } from '@/lib/confirm-token';
import { z } from 'zod';
import { normalizeToE164 } from '@/lib/phone/e164';

import { autoAssignTable } from '@/lib/table-availability';
import { resolveVenueMode } from '@/lib/venue-mode';
import { syncTableStatusesForBooking } from '@/lib/table-management/lifecycle';
import {
  attachVenueClockToAppointmentInput,
  fetchAppointmentInput,
  computeAppointmentAvailability,
} from '@/lib/availability/appointment-engine';
import { mergeAppointmentServiceWithPractitionerLink } from '@/lib/appointments/merge-service-with-overrides';
import { fetchEventInput, computeEventAvailability } from '@/lib/availability/event-ticket-engine';
import { fetchClassInput, computeClassAvailability } from '@/lib/availability/class-session-engine';
import { fetchResourceInput, computeResourceAvailability } from '@/lib/availability/resource-booking-engine';
import { cancellationDeadlineHoursBefore } from '@/lib/booking/cancellation-deadline';
import type { BookingEmailData } from '@/lib/emails/types';

const createBookingSchema = z.object({
  venue_id: z.string().uuid(),
  booking_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  booking_time: z.string().regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$/),
  party_size: z.number().int().min(1).max(50),
  name: z.string().min(1).max(200),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().min(1).max(24),
  dietary_notes: z.string().max(1000).optional(),
  occasion: z.string().max(200).optional(),
  source: z.enum(['online', 'phone', 'walk-in', 'widget', 'booking_page']),
  service_id: z.string().uuid().optional(),
  // Model B: appointment fields
  practitioner_id: z.string().uuid().optional(),
  appointment_service_id: z.string().uuid().optional(),
  // Model C: event ticket fields
  experience_event_id: z.string().uuid().optional(),
  ticket_lines: z.array(z.object({
    ticket_type_id: z.string().uuid(),
    label: z.string(),
    quantity: z.number().int().min(1),
    unit_price_pence: z.number().int().min(0),
  })).optional(),
  // Model D: class session fields
  class_instance_id: z.string().uuid().optional(),
  // Model E: resource fields
  resource_id: z.string().uuid().optional(),
  booking_end_time: z.string().regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$/).optional(),
});

/** Table reservations: fixed 48h refund window (legacy). */
function cancellationDeadline(bookingDate: string, bookingTime: string): string {
  return cancellationDeadlineHoursBefore(bookingDate, bookingTime, 48);
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

    const phoneE164 = normalizeToE164(phone, 'GB');
    if (!phoneE164) {
      return NextResponse.json({ error: 'Invalid phone number' }, { status: 400 });
    }

    const supabase = getSupabaseAdminClient();

    const { data: venue, error: venueErr } = await supabase
      .from('venues')
      .select('id, name, stripe_connected_account_id, booking_rules, deposit_config, timezone, table_management_enabled, show_table_in_confirmation, address, opening_hours')
      .eq('id', venue_id)
      .single();

    if (venueErr || !venue) {
      return NextResponse.json({ error: 'Venue not found' }, { status: 404 });
    }

    const venueMode = await resolveVenueMode(supabase, venue_id);

    // Dispatch to model-specific create handlers (B, C, D, E)
    if (venueMode.bookingModel !== 'table_reservation') {
      return handleNonTableBooking(request, supabase, venue, venueMode, parsed.data, phoneE164);
    }

    if (venueMode.availabilityEngine !== 'service') {
      return NextResponse.json({ error: AVAILABILITY_SETUP_REQUIRED_MESSAGE }, { status: 503 });
    }

    const { data: activeServices } = await supabase
      .from('venue_services')
      .select('id')
      .eq('venue_id', venue_id)
      .eq('is_active', true);
    const serviceIds = (activeServices ?? []).map((s) => s.id);

    let minParty = 1;
    let maxParty = 50;
    if (serviceIds.length > 0) {
      const { data: restrRows } = await supabase
        .from('booking_restrictions')
        .select('min_party_size_online, max_party_size_online')
        .in('service_id', serviceIds);
      for (const row of restrRows ?? []) {
        minParty = Math.max(minParty, row.min_party_size_online ?? 1);
        maxParty = Math.min(maxParty, row.max_party_size_online ?? 50);
      }
    } else {
      const rules = (venue.booking_rules as { min_party_size?: number; max_party_size?: number }) ?? {};
      minParty = rules.min_party_size ?? 1;
      maxParty = rules.max_party_size ?? 50;
    }
    if (party_size < minParty || party_size > maxParty) {
      return NextResponse.json(
        { error: `Party size must be between ${minParty} and ${maxParty}` },
        { status: 400 }
      );
    }

    const depositConfig = (venue.deposit_config as { enabled?: boolean; amount_per_person_gbp?: number; online_requires_deposit?: boolean; phone_requires_deposit?: boolean; min_party_size_for_deposit?: number; weekend_only?: boolean }) ?? {};

    const timeForDb = booking_time.length === 5 ? booking_time + ':00' : booking_time;
    const timeStr = timeForDb.slice(0, 5);

    let resolvedServiceId: string | null = requestServiceId ?? null;
    let estimatedEndTime: string | null = null;
    let requiresDeposit = false;
    let depositAmountPence: number | null = null;

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

    if (requiresDeposit && !venue.stripe_connected_account_id) {
      return NextResponse.json(
        { error: 'Venue has not set up payments; deposits are required for this booking type.' },
        { status: 400 }
      );
    }

    const { guest } = await findOrCreateGuest(supabase, venue_id, {
      name,
      email: email || null,
      phone: phoneE164,
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
      guest_email: email || null,
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

    if (venueMode.tableManagementEnabled && estimatedEndTime) {
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
        after(async () => {
          try {
            const result = await sendBookingConfirmationEmail(
              {
                id: booking.id, guest_name: name, guest_email: guest.email!,
                booking_date, booking_time, party_size,
                dietary_notes: dietary_notes ?? null,
                deposit_amount_pence: depositAmountPence ?? null,
                deposit_status: requiresDeposit ? 'Pending' : 'Not Required',
                manage_booking_link: manageBookingLink,
              },
              { name: venue.name, address: venue.address ?? undefined },
              venue.id,
            );
            if (!result.sent) console.warn('[after] confirmation email not sent:', result.reason);
          } catch (err) {
            console.error('[after] confirmation email failed:', err);
          }
        });
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

// ---------------------------------------------------------------------------
// Models B–E: unified non-table booking handler
// ---------------------------------------------------------------------------

async function handleNonTableBooking(
  request: NextRequest,
  supabase: ReturnType<typeof getSupabaseAdminClient>,
  venue: Record<string, unknown>,
  venueMode: Awaited<ReturnType<typeof resolveVenueMode>>,
  data: z.infer<typeof createBookingSchema>,
  phoneE164: string,
) {
  const {
    venue_id, booking_date, booking_time, party_size, name, email,
    dietary_notes, occasion, source,
    practitioner_id, appointment_service_id,
    experience_event_id, ticket_lines,
    class_instance_id,
    resource_id, booking_end_time,
  } = data;

  const timeForDb = booking_time.length === 5 ? booking_time + ':00' : booking_time;
  const timeStr = timeForDb.slice(0, 5);

  // ---- Validate slot availability per model ----
  let estimatedEndTime: string | null = null;
  let depositAmountPence: number | null = null;
  let requiresDeposit = false;
  let appointmentEmailExtras: Partial<BookingEmailData> = {};

  if (venueMode.bookingModel === 'practitioner_appointment') {
    if (!practitioner_id || !appointment_service_id) {
      return NextResponse.json({ error: 'practitioner_id and appointment_service_id are required' }, { status: 400 });
    }
    const input = await fetchAppointmentInput({ supabase, venueId: venue_id, date: booking_date, practitionerId: practitioner_id, serviceId: appointment_service_id });
    attachVenueClockToAppointmentInput(input, venue as { timezone?: string | null; booking_rules?: unknown; opening_hours?: unknown });
    const result = computeAppointmentAvailability(input);
    const prac = result.practitioners.find((p) => p.id === practitioner_id);
    const slotAvailable = prac?.slots.some((s) => s.start_time === timeStr && s.service_id === appointment_service_id);
    if (!slotAvailable) {
      return NextResponse.json({ error: 'This appointment slot is no longer available' }, { status: 409 });
    }
    const baseSvc = input.services.find((s) => s.id === appointment_service_id);
    const ps = input.practitionerServices.find(
      (row) => row.practitioner_id === practitioner_id && row.service_id === appointment_service_id,
    );
    const svc = baseSvc ? mergeAppointmentServiceWithPractitionerLink(baseSvc, ps) : undefined;
    const practRow = input.practitioners.find((p) => p.id === practitioner_id);
    appointmentEmailExtras = {
      email_variant: 'appointment',
      practitioner_name: practRow?.name ?? null,
      appointment_service_name: svc?.name ?? null,
      appointment_price_display:
        svc?.price_pence != null ? `£${(svc.price_pence / 100).toFixed(2)}` : null,
    };
    if (svc) {
      const [y, mo, d] = booking_date.split('-').map(Number);
      const [hh, mm] = timeStr.split(':').map(Number);
      const endDate = new Date(Date.UTC(y!, mo! - 1, d!, hh!, mm!, 0));
      endDate.setMinutes(endDate.getMinutes() + svc.duration_minutes);
      estimatedEndTime = endDate.toISOString();

      // Model B: only charge deposit when the service has a positive deposit (set in Appointment Services).
      if (svc.deposit_pence != null && svc.deposit_pence > 0) {
        requiresDeposit = true;
        depositAmountPence = svc.deposit_pence;
      }
    }
  } else if (venueMode.bookingModel === 'event_ticket') {
    if (!experience_event_id) {
      return NextResponse.json({ error: 'experience_event_id is required' }, { status: 400 });
    }
    const input = await fetchEventInput({ supabase, venueId: venue_id, date: booking_date });
    const result = computeEventAvailability(input);
    const event = result.find((e) => e.event_id === experience_event_id);
    if (!event || event.remaining_capacity < party_size) {
      return NextResponse.json({ error: 'This event is fully booked or unavailable' }, { status: 409 });
    }
    if (ticket_lines && ticket_lines.length > 0) {
      depositAmountPence = ticket_lines.reduce((sum, tl) => sum + tl.quantity * tl.unit_price_pence, 0);
      if (depositAmountPence > 0) requiresDeposit = true;
    }
  } else if (venueMode.bookingModel === 'class_session') {
    if (!class_instance_id) {
      return NextResponse.json({ error: 'class_instance_id is required' }, { status: 400 });
    }
    const input = await fetchClassInput({ supabase, venueId: venue_id, date: booking_date });
    const result = computeClassAvailability(input);
    const cls = result.find((c) => c.instance_id === class_instance_id);
    if (!cls || cls.remaining < party_size) {
      return NextResponse.json({ error: 'This class is full or unavailable' }, { status: 409 });
    }
    if (cls.price_pence != null && cls.price_pence > 0) {
      requiresDeposit = true;
      depositAmountPence = cls.price_pence * party_size;
    }
  } else if (venueMode.bookingModel === 'resource_booking') {
    if (!resource_id || !booking_end_time) {
      return NextResponse.json({ error: 'resource_id and booking_end_time are required' }, { status: 400 });
    }
    const endTimeStr = booking_end_time.length === 5 ? booking_end_time + ':00' : booking_end_time;
    const durationMinutes = (
      ((parseInt(endTimeStr.slice(0, 2)) * 60) + parseInt(endTimeStr.slice(3, 5))) -
      ((parseInt(timeStr.slice(0, 2)) * 60) + parseInt(timeStr.slice(3, 5)))
    );
    const input = await fetchResourceInput({ supabase, venueId: venue_id, date: booking_date, resourceId: resource_id });
    const result = computeResourceAvailability(input, durationMinutes);
    const res = result.find((r) => r.id === resource_id);
    const slotAvailable = res?.slots.some((s) => s.start_time === timeStr);
    if (!slotAvailable) {
      return NextResponse.json({ error: 'This resource slot is no longer available' }, { status: 409 });
    }
    if (res?.price_per_slot_pence != null) {
      const numSlots = Math.ceil(durationMinutes / res.slot_interval_minutes);
      depositAmountPence = res.price_per_slot_pence * numSlots;
      if (depositAmountPence > 0) requiresDeposit = true;
    }
  }

  if (requiresDeposit && !(venue.stripe_connected_account_id as string | null)) {
    return NextResponse.json(
      { error: 'Venue has not set up payments; payment is required for this booking.' },
      { status: 400 }
    );
  }

  const { guest } = await findOrCreateGuest(supabase, venue_id, {
    name,
    email: email || null,
    phone: phoneE164,
  });

  const bookingRulesJson = (venue.booking_rules as { cancellation_notice_hours?: number } | null) ?? {};
  const refundWindowHours =
    venueMode.bookingModel === 'practitioner_appointment' && typeof bookingRulesJson.cancellation_notice_hours === 'number'
      ? bookingRulesJson.cancellation_notice_hours
      : 48;

  const cancellation_deadline = cancellationDeadlineHoursBefore(booking_date, booking_time, refundWindowHours);
  const cancellationPolicySnapshot = {
    refund_window_hours: refundWindowHours,
    policy: `Full refund if cancelled ${refundWindowHours}+ hours before appointment start. No refund within ${refundWindowHours} hours of the appointment or for no-shows.`,
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
    guest_email: email || null,
    deposit_amount_pence: depositAmountPence,
    deposit_status: requiresDeposit ? 'Pending' : 'Not Required',
    cancellation_deadline,
    cancellation_policy_snapshot: cancellationPolicySnapshot,
    estimated_end_time: estimatedEndTime,
    // Model-specific anchors
    practitioner_id: practitioner_id ?? null,
    appointment_service_id: appointment_service_id ?? null,
    experience_event_id: experience_event_id ?? null,
    class_instance_id: class_instance_id ?? null,
    resource_id: resource_id ?? null,
    booking_end_time: booking_end_time ? (booking_end_time.length === 5 ? booking_end_time + ':00' : booking_end_time) : null,
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

  // Insert ticket lines for event/class bookings
  if (ticket_lines && ticket_lines.length > 0) {
    const lines = ticket_lines.map((tl) => ({
      booking_id: booking.id,
      ticket_type_id: tl.ticket_type_id,
      label: tl.label,
      quantity: tl.quantity,
      unit_price_pence: tl.unit_price_pence,
    }));
    await supabase.from('booking_ticket_lines').insert(lines);
  }

  // Stripe payment intent
  let client_secret: string | null = null;

  if (requiresDeposit && depositAmountPence != null && depositAmountPence > 0 && (venue.stripe_connected_account_id as string)) {
    try {
      const paymentIntent = await stripe.paymentIntents.create(
        {
          amount: depositAmountPence,
          currency: 'gbp',
          metadata: { booking_id: booking.id, venue_id },
          automatic_payment_methods: { enabled: true },
        },
        { stripeAccount: venue.stripe_connected_account_id as string }
      );
      client_secret = paymentIntent.client_secret;

      await supabase
        .from('bookings')
        .update({ stripe_payment_intent_id: paymentIntent.id, updated_at: new Date().toISOString() })
        .eq('id', booking.id);
    } catch (stripeErr) {
      console.error('PaymentIntent create failed:', stripeErr);
      await supabase.from('bookings').delete().eq('id', booking.id);
      return NextResponse.json({ error: 'Payment setup failed' }, { status: 500 });
    }
  }

  // Send confirmation for non-deposit bookings
  if (!requiresDeposit) {
    const manageToken = generateConfirmToken();
    await supabase
      .from('bookings')
      .update({ confirm_token_hash: hashConfirmToken(manageToken), updated_at: new Date().toISOString() })
      .eq('id', booking.id);

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : request.nextUrl.origin);
    const manageBookingLink = `${baseUrl}/manage/${booking.id}/${encodeURIComponent(manageToken)}`;

    if (guest.email) {
      after(async () => {
        try {
          await sendBookingConfirmationEmail(
            {
              id: booking.id, guest_name: name, guest_email: guest.email!,
              booking_date, booking_time, party_size,
              dietary_notes: dietary_notes ?? null,
              deposit_amount_pence: depositAmountPence ?? null,
              deposit_status: requiresDeposit ? 'Pending' : 'Not Required',
              manage_booking_link: manageBookingLink,
              ...appointmentEmailExtras,
            },
            { name: venue.name as string, address: (venue.address as string) ?? undefined },
            venue_id,
          );
        } catch (err) {
          console.error('[after] confirmation email failed:', err);
        }
      });
    }
  }

  return NextResponse.json(
    {
      booking_id: booking.id,
      requires_deposit: requiresDeposit,
      deposit_amount_pence: depositAmountPence ?? 0,
      client_secret: client_secret ?? undefined,
      stripe_account_id: requiresDeposit ? (venue.stripe_connected_account_id as string) : undefined,
      status: booking.status,
      cancellation_notice_hours: refundWindowHours,
    },
    { status: 201 }
  );
}
