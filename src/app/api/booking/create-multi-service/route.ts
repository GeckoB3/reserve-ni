import { NextRequest, NextResponse, after } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase';
import { stripe } from '@/lib/stripe';
import { findOrCreateGuest } from '@/lib/guests';
import { sendBookingConfirmationNotifications } from '@/lib/communications/send-templated';
import { generateConfirmToken, hashConfirmToken } from '@/lib/confirm-token';
import { normalizeToE164 } from '@/lib/phone/e164';
import { resolveVenueMode } from '@/lib/venue-mode';
import {
  attachVenueClockToAppointmentInput,
  fetchAppointmentInput,
  validateExactAppointmentStart,
  type PhantomBooking,
} from '@/lib/availability/appointment-engine';
import { mergeAppointmentServiceWithPractitionerLink } from '@/lib/appointments/merge-service-with-overrides';
import { z } from 'zod';
import { cancellationDeadlineHoursBefore } from '@/lib/booking/cancellation-deadline';
import { generateGroupBookingId } from '@/lib/booking/group-booking';
import type { GroupAppointmentLine } from '@/lib/emails/types';
import { timeToMinutes, minutesToTime } from '@/lib/availability';
import { isUnifiedSchedulingVenue } from '@/lib/booking/unified-scheduling';
import { createShortManageLink } from '@/lib/short-manage-link';

const serviceEntrySchema = z.object({
  service_id: z.string().uuid(),
  practitioner_id: z.string().uuid(),
  start_time: z.string().regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$/),
});

const createMultiServiceSchema = z.object({
  venue_id: z.string().uuid(),
  booking_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  name: z.string().min(1).max(200),
  email: z.union([z.literal(''), z.string().email()]).optional(),
  phone: z.string().max(24).optional(),
  source: z.enum(['online', 'phone', 'walk-in', 'widget', 'booking_page']),
  services: z.array(serviceEntrySchema).min(1).max(4),
  dietary_notes: z.string().max(1000).optional(),
  occasion: z.string().max(200).optional(),
});

/**
 * POST /api/booking/create-multi-service
 * One guest, one practitioner, consecutive services (Model B), linked by group_booking_id.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = createMultiServiceSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { venue_id, booking_date, name, email, phone, source, services: rawServices, dietary_notes, occasion } =
      parsed.data;

    const phoneRaw = (phone ?? '').trim();
    let phoneE164: string | null = null;
    if (phoneRaw) {
      const n = normalizeToE164(phoneRaw, 'GB');
      if (!n) {
        return NextResponse.json({ error: 'Invalid phone number' }, { status: 400 });
      }
      phoneE164 = n;
    }

    const supabase = getSupabaseAdminClient();

    const { data: venue, error: venueErr } = await supabase
      .from('venues')
      .select('id, name, stripe_connected_account_id, address, booking_rules, timezone, opening_hours')
      .eq('id', venue_id)
      .single();

    if (venueErr || !venue) {
      return NextResponse.json({ error: 'Venue not found' }, { status: 404 });
    }

    const venueMode = await resolveVenueMode(supabase, venue_id);
    if (!isUnifiedSchedulingVenue(venueMode.bookingModel)) {
      return NextResponse.json({ error: 'Multi-service bookings are only for appointment businesses' }, { status: 400 });
    }

    const practitionerId = rawServices[0]!.practitioner_id;
    if (!rawServices.every((s) => s.practitioner_id === practitionerId)) {
      return NextResponse.json({ error: 'All services must be with the same practitioner' }, { status: 400 });
    }

    const sorted = [...rawServices].sort(
      (a, b) => timeToMinutes(a.start_time.slice(0, 5)) - timeToMinutes(b.start_time.slice(0, 5)),
    );

    type ValidatedSeg = {
      practitioner_id: string;
      appointment_service_id: string;
      booking_date: string;
      booking_time: string;
      duration_minutes: number;
      buffer_minutes: number;
      deposit_pence: number;
      estimated_end_time: string | null;
      service_display_name: string;
      service_price_pence: number | null;
    };

    const validated: ValidatedSeg[] = [];
    const phantoms: PhantomBooking[] = [];

    for (let i = 0; i < sorted.length; i++) {
      const seg = sorted[i]!;
      const timeStr = seg.start_time.slice(0, 5);

      const input = await fetchAppointmentInput({
        supabase,
        venueId: venue_id,
        date: booking_date,
        practitionerId,
        serviceId: seg.service_id,
      });
      input.phantomBookings = [...phantoms];

      attachVenueClockToAppointmentInput(input, venue as { timezone?: string | null; booking_rules?: unknown; opening_hours?: unknown });
      const exact = validateExactAppointmentStart(input, practitionerId, seg.service_id, timeStr);
      if (!exact.ok) {
        return NextResponse.json(
          { error: exact.reason ?? `Slot at ${timeStr} is not available` },
          { status: 409 },
        );
      }

      const baseSvc = input.services.find((s) => s.id === seg.service_id);
      const ps = input.practitionerServices.find(
        (row) => row.practitioner_id === practitionerId && row.service_id === seg.service_id,
      );
      const svc = baseSvc ? mergeAppointmentServiceWithPractitionerLink(baseSvc, ps) : undefined;
      const durationMins = svc?.duration_minutes ?? 30;
      const bufferMins = svc?.buffer_minutes ?? 0;

      if (i > 0) {
        const prev = validated[i - 1]!;
        const expectedStartM =
          timeToMinutes(prev.booking_time) + prev.duration_minutes + prev.buffer_minutes;
        const actualM = timeToMinutes(timeStr);
        if (expectedStartM !== actualM) {
          return NextResponse.json(
            {
              error: 'Services must be consecutive (each start = previous end + buffer)',
              expected_start: minutesToTime(expectedStartM),
            },
            { status: 400 },
          );
        }
      }

      let estimatedEndTime: string | null = null;
      let depositPence = 0;
      if (svc) {
        const [y, mo, d] = booking_date.split('-').map(Number);
        const [hh, mm] = timeStr.split(':').map(Number);
        const endDate = new Date(Date.UTC(y!, mo! - 1, d!, hh!, mm!, 0));
        endDate.setMinutes(endDate.getMinutes() + svc.duration_minutes);
        estimatedEndTime = endDate.toISOString();
        if (svc.deposit_pence != null && svc.deposit_pence > 0) {
          depositPence = svc.deposit_pence;
        }
      }

      validated.push({
        practitioner_id: practitionerId,
        appointment_service_id: seg.service_id,
        booking_date,
        booking_time: timeStr,
        duration_minutes: durationMins,
        buffer_minutes: bufferMins,
        deposit_pence: depositPence,
        estimated_end_time: estimatedEndTime,
        service_display_name: svc?.name ?? 'Treatment',
        service_price_pence: svc?.price_pence ?? null,
      });

      phantoms.push({
        practitioner_id: practitionerId,
        start_time: timeStr,
        duration_minutes: durationMins,
        buffer_minutes: bufferMins,
      });
    }

    const { data: nameRows } =
      venueMode.bookingModel === 'unified_scheduling'
        ? await supabase.from('unified_calendars').select('id, name').eq('venue_id', venue_id)
        : await supabase.from('practitioners').select('id, name').eq('venue_id', venue_id);
    const prMap = new Map(
      (nameRows ?? []).map((p: { id: string; name: string }) => [p.id, p.name]),
    );

    const groupAppointmentLines: GroupAppointmentLine[] = validated.map((p) => ({
      person_label: '',
      booking_date: p.booking_date,
      booking_time: p.booking_time,
      practitioner_name: prMap.get(p.practitioner_id) ?? 'Staff',
      service_name: p.service_display_name,
      price_display: p.service_price_pence != null ? `£${(p.service_price_pence / 100).toFixed(2)}` : null,
    }));

    const totalDepositPence = validated.reduce((sum, p) => sum + p.deposit_pence, 0);
    const requiresDeposit = totalDepositPence > 0;

    if (requiresDeposit && !venue.stripe_connected_account_id) {
      return NextResponse.json(
        { error: 'Venue has not set up payments; deposits are required for these services.' },
        { status: 400 },
      );
    }

    const emailNorm = email && email.trim() !== '' ? email.trim().toLowerCase() : null;
    const { guest } = await findOrCreateGuest(supabase, venue_id, {
      name,
      email: emailNorm,
      phone: phoneE164,
    });

    const groupBookingId = generateGroupBookingId();
    const bookingIds: string[] = [];

    const bookingRulesJson = (venue.booking_rules as { cancellation_notice_hours?: number } | null) ?? {};
    const refundWindowHours =
      typeof bookingRulesJson.cancellation_notice_hours === 'number'
        ? bookingRulesJson.cancellation_notice_hours
        : 48;

    const firstStart = validated[0]!.booking_time;
    const deadline = cancellationDeadlineHoursBefore(booking_date, firstStart, refundWindowHours);
    const policySnapshot = {
      refund_window_hours: refundWindowHours,
      policy: `Full refund if cancelled ${refundWindowHours}+ hours before appointment start. No refund within ${refundWindowHours} hours of the appointment or for no-shows.`,
    };

    for (const seg of validated) {
      const timeForDb = seg.booking_time + ':00';
      const insert: Record<string, unknown> = {
        venue_id,
        guest_id: guest.id,
        booking_date: seg.booking_date,
        booking_time: timeForDb,
        party_size: 1,
        status: requiresDeposit ? 'Pending' : 'Confirmed',
        source,
        guest_email: guest.email,
        dietary_notes: dietary_notes?.trim() || null,
        occasion: occasion?.trim() || null,
        deposit_amount_pence: seg.deposit_pence > 0 ? seg.deposit_pence : null,
        deposit_status: seg.deposit_pence > 0 ? 'Pending' : 'Not Required',
        cancellation_deadline: deadline,
        cancellation_policy_snapshot: policySnapshot,
        estimated_end_time: seg.estimated_end_time,
        practitioner_id:
          venueMode.bookingModel === 'unified_scheduling' ? null : seg.practitioner_id,
        appointment_service_id:
          venueMode.bookingModel === 'unified_scheduling' ? null : seg.appointment_service_id,
        group_booking_id: groupBookingId,
        person_label: null,
        ...(venueMode.bookingModel === 'unified_scheduling'
          ? {
              calendar_id: seg.practitioner_id,
              service_item_id: seg.appointment_service_id,
            }
          : {}),
      };

      const { data: booking, error: bookErr } = await supabase
        .from('bookings')
        .insert(insert)
        .select('id')
        .single();

      if (bookErr) {
        console.error('Multi-service booking insert failed:', bookErr);
        if (bookingIds.length > 0) {
          await supabase.from('bookings').delete().in('id', bookingIds);
        }
        return NextResponse.json({ error: 'Failed to create booking' }, { status: 500 });
      }

      bookingIds.push(booking.id);
    }

    let client_secret: string | null = null;

    if (requiresDeposit && totalDepositPence > 0 && venue.stripe_connected_account_id) {
      try {
        const primaryId = bookingIds[0]!;
        const paymentIntent = await stripe.paymentIntents.create(
          {
            amount: totalDepositPence,
            currency: 'gbp',
            metadata: {
              booking_id: primaryId,
              booking_ids: bookingIds.join(','),
              group_booking_id: groupBookingId,
              venue_id,
            },
            automatic_payment_methods: { enabled: true },
          },
          { stripeAccount: venue.stripe_connected_account_id },
        );
        client_secret = paymentIntent.client_secret;

        await supabase
          .from('bookings')
          .update({
            stripe_payment_intent_id: paymentIntent.id,
            updated_at: new Date().toISOString(),
          })
          .in('id', bookingIds);
      } catch (stripeErr) {
        console.error('Multi-service PaymentIntent create failed:', stripeErr);
        await supabase.from('bookings').delete().in('id', bookingIds);
        return NextResponse.json({ error: 'Payment setup failed' }, { status: 500 });
      }
    }

    if (!requiresDeposit && (guest.email || guest.phone)) {
      const manageToken = generateConfirmToken();
      const primaryBookingId = bookingIds[0]!;
      await supabase
        .from('bookings')
        .update({
          confirm_token_hash: hashConfirmToken(manageToken),
          updated_at: new Date().toISOString(),
        })
        .eq('id', primaryBookingId);

      const manageBookingLink = createShortManageLink(primaryBookingId);

      after(async () => {
        try {
          await sendBookingConfirmationNotifications(
            {
              id: primaryBookingId,
              guest_name: name,
              guest_email: guest.email ?? null,
              guest_phone: guest.phone ?? null,
              booking_date: validated[0]!.booking_date,
              booking_time: validated[0]!.booking_time,
              party_size: 1,
              dietary_notes: dietary_notes?.trim() || null,
              deposit_amount_pence: null,
              deposit_status: 'Not Required',
              manage_booking_link: manageBookingLink,
              email_variant: 'appointment',
              group_appointments: groupAppointmentLines,
              practitioner_name: groupAppointmentLines[0]?.practitioner_name ?? null,
              appointment_service_name:
                groupAppointmentLines.length === 1
                  ? groupAppointmentLines[0]!.service_name
                  : 'Multi-service appointment',
              appointment_price_display: null,
            },
            { name: venue.name, address: venue.address ?? undefined },
            venue_id,
          );
        } catch (err) {
          console.error('[after] multi-service confirmation email failed:', err);
        }
      });
    }

    return NextResponse.json(
      {
        group_booking_id: groupBookingId,
        booking_ids: bookingIds,
        primary_booking_id: bookingIds[0],
        requires_deposit: requiresDeposit,
        total_deposit_pence: totalDepositPence,
        client_secret: client_secret ?? undefined,
        stripe_account_id: requiresDeposit ? venue.stripe_connected_account_id : undefined,
        status: requiresDeposit ? 'Pending' : 'Confirmed',
        cancellation_notice_hours: refundWindowHours,
      },
      { status: 201 },
    );
  } catch (err) {
    console.error('POST /api/booking/create-multi-service failed:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
