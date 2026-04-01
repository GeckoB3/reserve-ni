import { NextRequest, NextResponse, after } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getVenueStaff } from '@/lib/venue-auth';
import { getSupabaseAdminClient } from '@/lib/supabase';
import { stripe } from '@/lib/stripe';
import { findOrCreateGuest } from '@/lib/guests';
import { generateConfirmToken, hashConfirmToken } from '@/lib/confirm-token';

import { sendBookingConfirmationNotifications, sendDepositRequestNotifications } from '@/lib/communications/send-templated';
import { autoAssignTable } from '@/lib/table-availability';
import { computeAvailability, fetchEngineInput } from '@/lib/availability';
import { AVAILABILITY_SETUP_REQUIRED_MESSAGE } from '@/lib/availability/availability-errors';
import { resolveVenueMode } from '@/lib/venue-mode';
import { syncTableStatusesForBooking } from '@/lib/table-management/lifecycle';
import { resolveDurationAndBufferForTableAssignment } from '@/lib/table-management/booking-table-duration';
import {
  attachVenueClockToAppointmentInput,
  fetchAppointmentInput,
  computeAppointmentAvailability,
} from '@/lib/availability/appointment-engine';
import { z } from 'zod';
import { normalizeToE164 } from '@/lib/phone/e164';
import { createPaymentLinkToken } from '@/lib/payment-token';
import { isUnifiedSchedulingVenue } from '@/lib/booking/unified-scheduling';

const phoneBookingSchema = z.object({
  booking_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  booking_time: z.string().regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$/),
  party_size: z.number().int().min(1).max(50),
  name: z.string().min(1).max(200),
  /** Required for table (Model A) phone bookings; optional for practitioner appointments (Model B). */
  phone: z.string().max(24).optional(),
  email: z.union([z.literal(''), z.string().email()]).optional(),
  dietary_notes: z.string().max(500).optional(),
  occasion: z.string().max(200).optional(),
  special_requests: z.string().max(500).optional(),
  require_deposit: z.boolean().optional(),
  practitioner_id: z.string().uuid().optional(),
  appointment_service_id: z.string().uuid().optional(),
});

function cancellationDeadline(bookingDate: string, bookingTime: string): string {
  const [y, m, d] = bookingDate.split('-').map(Number);
  const [hh, mm] = bookingTime.slice(0, 5).split(':').map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d!, hh, mm, 0));
  dt.setHours(dt.getHours() - 48);
  return dt.toISOString();
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
      .select('id, name, stripe_connected_account_id, booking_rules, deposit_config, table_management_enabled, show_table_in_confirmation, timezone, address, opening_hours')
      .eq('id', venueId)
      .single();

    if (!venue) {
      return NextResponse.json({ error: 'Venue not found' }, { status: 404 });
    }

    const venueMode = await resolveVenueMode(admin, venueId);

    const phoneRaw = (phone ?? '').trim();
    let phoneE164: string | null = null;
    if (isUnifiedSchedulingVenue(venueMode.bookingModel)) {
      if (phoneRaw) {
        const n = normalizeToE164(phoneRaw, 'GB');
        if (!n) {
          return NextResponse.json({ error: 'Invalid phone number' }, { status: 400 });
        }
        phoneE164 = n;
      }
    } else {
      if (!phoneRaw) {
        return NextResponse.json({ error: 'Phone number is required' }, { status: 400 });
      }
      const n = normalizeToE164(phoneRaw, 'GB');
      if (!n) {
        return NextResponse.json({ error: 'Invalid phone number' }, { status: 400 });
      }
      phoneE164 = n;
    }

    const depositConfig = (venue.deposit_config as {
      enabled?: boolean;
      amount_per_person_gbp?: number;
      phone_requires_deposit?: boolean;
    }) ?? {};
    const amountPerPersonGbp = depositConfig.amount_per_person_gbp ?? 5;

    const emailNorm = email && email.trim() !== '' ? email.trim().toLowerCase() : null;
    const { guest } = await findOrCreateGuest(admin, venueId, {
      name,
      email: emailNorm,
      phone: phoneE164,
    });
    const timeForDb = booking_time.length === 5 ? booking_time + ':00' : booking_time;
    const timeStr = timeForDb.slice(0, 5);

    // --- Model B: Practitioner appointment ---
    if (isUnifiedSchedulingVenue(venueMode.bookingModel)) {
      const { practitioner_id, appointment_service_id } = parsed.data;
      if (!practitioner_id || !appointment_service_id) {
        return NextResponse.json(
          { error: 'practitioner_id and appointment_service_id are required for appointment bookings' },
          { status: 400 },
        );
      }

      const appointmentInput = await fetchAppointmentInput({
        supabase: admin,
        venueId,
        date: booking_date,
        practitionerId: practitioner_id,
        serviceId: appointment_service_id,
      });

      attachVenueClockToAppointmentInput(appointmentInput, venue as { timezone?: string | null; booking_rules?: unknown; opening_hours?: unknown });
      const availResult = computeAppointmentAvailability(appointmentInput);
      const practitionerSlots = availResult.practitioners.find((p) => p.id === practitioner_id);
      const matchingSlot = practitionerSlots?.slots.find(
        (s) => s.start_time === timeStr && s.service_id === appointment_service_id,
      );

      if (!matchingSlot) {
        return NextResponse.json({ error: 'Selected time is not available for this practitioner and service' }, { status: 409 });
      }

      const svc = appointmentInput.services.find((s) => s.id === appointment_service_id);
      const practRow = appointmentInput.practitioners.find((p) => p.id === practitioner_id);
      const apptEmailExtras = {
        email_variant: 'appointment' as const,
        practitioner_name: practRow?.name ?? null,
        appointment_service_name: svc?.name ?? null,
        appointment_price_display:
          svc?.price_pence != null ? `£${(svc.price_pence / 100).toFixed(2)}` : null,
      };
      const durationMins = svc?.duration_minutes ?? matchingSlot.duration_minutes;
      const [y, mo, d] = booking_date.split('-').map(Number);
      const [hh, mm] = timeStr.split(':').map(Number);
      const endDate = new Date(Date.UTC(y!, mo! - 1, d!, hh!, mm!, 0));
      endDate.setMinutes(endDate.getMinutes() + durationMins);
      const estimatedEndTime = endDate.toISOString();
      const bookingEndTime = `${String(endDate.getUTCHours()).padStart(2, '0')}:${String(endDate.getUTCMinutes()).padStart(2, '0')}:00`;

      const depositPence = svc?.deposit_pence ?? null;
      const requiresDeposit = (require_deposit ?? false) && depositPence != null && depositPence > 0;
      const depositAmountPence = requiresDeposit ? depositPence : null;

      if (requiresDeposit && !venue.stripe_connected_account_id) {
        return NextResponse.json(
          { error: 'Venue has not set up payments; deposits are required for this booking type.' },
          { status: 400 },
        );
      }

      const apptInsert = {
        venue_id: venueId,
        guest_id: guest.id,
        booking_date,
        booking_time: timeForDb,
        booking_end_time: bookingEndTime,
        party_size: 1,
        status: requiresDeposit ? 'Pending' : 'Confirmed',
        source: 'phone' as const,
        guest_email: guest.email || null,
        deposit_amount_pence: depositAmountPence,
        deposit_status: requiresDeposit ? ('Pending' as const) : ('Not Required' as const),
        cancellation_deadline: cancellationDeadline(booking_date, booking_time),
        dietary_notes: dietary_notes?.trim() || null,
        occasion: occasion?.trim() || null,
        special_requests: special_requests?.trim() || null,
        practitioner_id,
        appointment_service_id,
        estimated_end_time: estimatedEndTime,
      };

      const { data: apptBooking, error: apptErr } = await admin
        .from('bookings')
        .insert(apptInsert)
        .select('id')
        .single();

      if (apptErr) {
        console.error('Appointment booking insert failed:', apptErr);
        return NextResponse.json({ error: 'Failed to create booking' }, { status: 500 });
      }

      let payment_url: string | undefined;
      if (requiresDeposit && depositAmountPence != null && depositAmountPence > 0 && venue.stripe_connected_account_id) {
        try {
          const paymentIntent = await stripe.paymentIntents.create(
            {
              amount: depositAmountPence,
              currency: 'gbp',
              metadata: { booking_id: apptBooking.id, venue_id: venueId },
              automatic_payment_methods: { enabled: true },
            },
            { stripeAccount: venue.stripe_connected_account_id },
          );
          await admin
            .from('bookings')
            .update({ stripe_payment_intent_id: paymentIntent.id, updated_at: new Date().toISOString() })
            .eq('id', apptBooking.id);

          const token = createPaymentLinkToken(apptBooking.id);
          const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : request.nextUrl.origin);
          payment_url = `${baseUrl}/pay?t=${token}`;
        } catch (stripeErr) {
          console.error('PaymentIntent create failed for appointment:', stripeErr);
          await admin.from('bookings').delete().eq('id', apptBooking.id);
          return NextResponse.json({ error: 'Payment setup failed' }, { status: 500 });
        }

        const depositBookingPayload = {
          id: apptBooking.id,
          guest_name: name,
          guest_email: guest.email ?? null,
          guest_phone: guest.phone ?? null,
          booking_date,
          booking_time,
          party_size: 1,
          special_requests: special_requests ?? null,
          dietary_notes: dietary_notes ?? null,
          deposit_amount_pence: depositAmountPence,
        };
        after(async () => {
          try {
            const results = await sendDepositRequestNotifications(
              depositBookingPayload,
              { name: venue.name, address: venue.address ?? undefined },
              venueId,
              payment_url!,
            );
            if (!results.email.sent && !results.sms.sent) {
              console.warn('[after] deposit request notifications not sent:', {
                email: results.email.reason,
                sms: results.sms.reason,
              });
            }
          } catch (err) {
            console.error('[after] deposit request notifications failed:', err);
          }
        });
      } else {
        const manageToken = generateConfirmToken();
        await admin
          .from('bookings')
          .update({ confirm_token_hash: hashConfirmToken(manageToken), updated_at: new Date().toISOString() })
          .eq('id', apptBooking.id);

        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : request.nextUrl.origin);
        const manageBookingLink = `${baseUrl}/manage/${apptBooking.id}/${encodeURIComponent(manageToken)}`;

        if (guest.email || guest.phone) {
          after(async () => {
            try {
              const { email, sms } = await sendBookingConfirmationNotifications(
                {
                  id: apptBooking.id,
                  guest_name: name,
                  guest_email: guest.email ?? null,
                  guest_phone: guest.phone ?? null,
                  booking_date,
                  booking_time,
                  party_size: 1,
                  special_requests: special_requests ?? null,
                  dietary_notes: dietary_notes ?? null,
                  manage_booking_link: manageBookingLink,
                  ...apptEmailExtras,
                },
                { name: venue.name, address: venue.address ?? undefined },
                venueId,
              );
              if (!email.sent) console.warn('[after] appointment confirmation email not sent:', email.reason);
              if (!sms.sent && sms.reason !== 'skipped' && sms.reason !== 'no_phone') {
                console.warn('[after] appointment confirmation SMS not sent:', sms.reason);
              }
            } catch (err) {
              console.error('[after] appointment confirmation notifications failed:', err);
            }
          });
        }
      }

      return NextResponse.json(
        {
          booking_id: apptBooking.id,
          payment_url: payment_url ?? undefined,
          message: payment_url ? 'Appointment created. Deposit link sent.' : 'Appointment created.',
        },
        { status: 201 },
      );
    }

    // --- Model A: Table reservation ---
    if (venueMode.availabilityEngine !== 'service') {
      return NextResponse.json({ error: AVAILABILITY_SETUP_REQUIRED_MESSAGE }, { status: 503 });
    }

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

    const { durationMinutes, bufferMinutes } = await resolveDurationAndBufferForTableAssignment(
      admin,
      engineInput,
      booking_date,
      party_size,
      slot.service_id,
    );
    const [y, mo, d] = booking_date.split('-').map(Number);
    const [hh, mm] = timeStr.split(':').map(Number);
    const endDate = new Date(Date.UTC(y!, mo! - 1, d!, hh!, mm!, 0));
    endDate.setMinutes(endDate.getMinutes() + durationMinutes);
    const estimatedEndTime = endDate.toISOString();

    const channelRequiresPhone = depositConfig.phone_requires_deposit ?? false;
    const requiresDeposit =
      require_deposit !== undefined
        ? require_deposit
        : (slot.deposit_required && channelRequiresPhone) ||
          ((depositConfig.enabled ?? false) && channelRequiresPhone);
    const depositAmountPence = requiresDeposit ? Math.round(amountPerPersonGbp * party_size * 100) : null;

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
      guest_email: guest.email || null,
      deposit_amount_pence: depositAmountPence,
      deposit_status: requiresDeposit ? ('Pending' as const) : ('Not Required' as const),
      cancellation_deadline: cancellationDeadline(booking_date, booking_time),
      dietary_notes: dietary_notes?.trim() || null,
      occasion: occasion?.trim() || null,
      special_requests: special_requests?.trim() || null,
      service_id: slot.service_id,
      estimated_end_time: estimatedEndTime,
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

    let tableAssignmentUnassigned = false;
    if (venueMode.tableManagementEnabled) {
      const assigned = await autoAssignTable(
        admin,
        venueId,
        booking.id,
        booking_date,
        booking_time.slice(0, 5),
        durationMinutes,
        bufferMinutes,
        party_size,
      );
      if (assigned) {
        await syncTableStatusesForBooking(
          admin,
          booking.id,
          assigned.table_ids,
          bookingInsert.status,
          staff.id
        );
      } else {
        tableAssignmentUnassigned = true;
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

        const token = createPaymentLinkToken(booking.id);
        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : request.nextUrl.origin);
        payment_url = `${baseUrl}/pay?t=${token}`;
      } catch (stripeErr) {
        console.error('PaymentIntent create failed for phone booking:', stripeErr);
        await admin.from('bookings').delete().eq('id', booking.id);
        return NextResponse.json({ error: 'Payment setup failed' }, { status: 500 });
      }

      const tableDepositPayload = {
        id: booking.id,
        guest_name: name,
        guest_email: guest.email ?? null,
        guest_phone: guest.phone ?? null,
        booking_date,
        booking_time,
        party_size,
        special_requests: special_requests ?? null,
        dietary_notes: dietary_notes ?? null,
        deposit_amount_pence: depositAmountPence ?? null,
      };
      after(async () => {
        try {
          const results = await sendDepositRequestNotifications(
            tableDepositPayload,
            { name: venue.name, address: venue.address ?? undefined },
            venueId,
            payment_url!,
          );
          if (!results.email.sent && !results.sms.sent) {
            console.warn('[after] deposit request notifications not sent:', {
              email: results.email.reason,
              sms: results.sms.reason,
            });
          }
        } catch (err) {
          console.error('[after] deposit request notifications failed:', err);
        }
      });
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

      if (guest.email || guest.phone) {
        after(async () => {
          try {
            const { email, sms } = await sendBookingConfirmationNotifications(
              {
                id: booking.id,
                guest_name: name,
                guest_email: guest.email ?? null,
                guest_phone: guest.phone ?? null,
                booking_date,
                booking_time,
                party_size,
                special_requests: special_requests ?? null,
                dietary_notes: dietary_notes ?? null,
                manage_booking_link: manageBookingLink,
              },
              { name: venue.name, address: venue.address ?? undefined },
              venueId,
            );
            if (!email.sent) console.warn('[after] confirmation email not sent:', email.reason);
            if (!sms.sent && sms.reason !== 'skipped' && sms.reason !== 'no_phone') {
              console.warn('[after] confirmation SMS not sent:', sms.reason);
            }
          } catch (err) {
            console.error('[after] confirmation notifications failed:', err);
          }
        });
      }
    }

    return NextResponse.json(
      {
        booking_id: booking.id,
        payment_url: payment_url ?? undefined,
        message: payment_url ? 'Booking created. Deposit link sent to guest (stub: check logs).' : 'Booking created.',
        ...(tableAssignmentUnassigned ? { table_assignment_unassigned: true as const } : {}),
      },
      { status: 201 }
    );
  } catch (err) {
    console.error('POST /api/venue/bookings failed:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
