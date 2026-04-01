import { NextRequest, NextResponse, after } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase';
import { stripe } from '@/lib/stripe';
import { sendCancellationNotification } from '@/lib/communications/send-templated';
import type { BookingEmailData, VenueEmailData } from '@/lib/emails/types';
import { enrichBookingEmailForAppointment } from '@/lib/emails/booking-email-enrichment';
import { verifyConfirmToken } from '@/lib/confirm-token';
import { verifyBookingHmac } from '@/lib/short-manage-link';
import { validateBookingStatusTransition, applyBookingLifecycleStatusEffects } from '@/lib/table-management/lifecycle';
import { computeAvailability, fetchEngineInput } from '@/lib/availability';
import { AVAILABILITY_SETUP_REQUIRED_MESSAGE } from '@/lib/availability/availability-errors';
import { resolveVenueMode } from '@/lib/venue-mode';
import {
  attachVenueClockToAppointmentInput,
  computeAppointmentAvailability,
  fetchAppointmentInput,
} from '@/lib/availability/appointment-engine';
import { mergeAppointmentServiceWithPractitionerLink } from '@/lib/appointments/merge-service-with-overrides';
import { cancellationDeadlineHoursBefore } from '@/lib/booking/cancellation-deadline';
import { isUnifiedSchedulingVenue } from '@/lib/booking/unified-scheduling';

/**
 * GET /api/confirm?booking_id=uuid&token=xxx  (token-based)
 * GET /api/confirm?booking_id=uuid&hmac=xxx   (HMAC-based, used by /m/ short links)
 * Returns booking details for confirm-or-cancel page if auth is valid.
 */
export async function GET(request: NextRequest) {
  try {
    const bookingId = request.nextUrl.searchParams.get('booking_id');
    const token = request.nextUrl.searchParams.get('token');
    const hmac = request.nextUrl.searchParams.get('hmac');
    if (!bookingId || (!token && !hmac)) {
      return NextResponse.json({ error: 'Missing booking_id or auth' }, { status: 400 });
    }

    const supabase = getSupabaseAdminClient();
    const { data: booking, error: bookErr } = await supabase
      .from('bookings')
      .select(
        'id, venue_id, guest_id, booking_date, booking_time, party_size, status, deposit_status, deposit_amount_pence, confirm_token_hash, confirm_token_used_at, practitioner_id, appointment_service_id, calendar_id, service_item_id, updated_at',
      )
      .eq('id', bookingId)
      .single();

    if (bookErr || !booking) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
    }

    if (hmac) {
      if (!verifyBookingHmac(bookingId, hmac)) {
        return NextResponse.json({ error: 'Invalid link' }, { status: 400 });
      }
    } else if (token) {
      if (booking.confirm_token_used_at) {
        return NextResponse.json({ error: 'This link has already been used' }, { status: 410 });
      }
      if (!verifyConfirmToken(token, booking.confirm_token_hash)) {
        return NextResponse.json({ error: 'Invalid link' }, { status: 400 });
      }
    }

    const { data: venue } = await supabase
      .from('venues')
      .select('name, address, phone, booking_model, booking_rules')
      .eq('id', booking.venue_id)
      .single();
    const depositPaid = booking.deposit_status === 'Paid';
    const timeStr = typeof booking.booking_time === 'string' ? booking.booking_time.slice(0, 5) : '';

    let practitioner_name: string | null = null;
    let appointment_service_name: string | null = null;

    const bookingRow = booking as {
      practitioner_id?: string | null;
      appointment_service_id?: string | null;
      calendar_id?: string | null;
      service_item_id?: string | null;
    };
    const unifiedVenue = isUnifiedSchedulingVenue(venue?.booking_model);
    const legacyAppt = Boolean(bookingRow.practitioner_id && bookingRow.appointment_service_id);
    const unifiedAppt = Boolean(unifiedVenue && bookingRow.calendar_id && bookingRow.service_item_id);
    const isAppointment = legacyAppt || unifiedAppt;

    if (unifiedAppt) {
      const [{ data: uc }, { data: si }] = await Promise.all([
        supabase.from('unified_calendars').select('name').eq('id', bookingRow.calendar_id as string).maybeSingle(),
        supabase.from('service_items').select('name').eq('id', bookingRow.service_item_id as string).maybeSingle(),
      ]);
      practitioner_name = (uc as { name?: string } | null)?.name ?? null;
      appointment_service_name = (si as { name?: string } | null)?.name ?? null;
    } else if (legacyAppt) {
      const [{ data: pr }, { data: svc }] = await Promise.all([
        supabase.from('practitioners').select('name').eq('id', bookingRow.practitioner_id as string).maybeSingle(),
        supabase.from('appointment_services').select('name').eq('id', bookingRow.appointment_service_id as string).maybeSingle(),
      ]);
      practitioner_name = pr?.name ?? null;
      appointment_service_name = svc?.name ?? null;
    }

    const practitionerIdForUi = (bookingRow.practitioner_id ?? bookingRow.calendar_id) as string | null | undefined;
    const serviceIdForUi = (bookingRow.appointment_service_id ?? bookingRow.service_item_id) as string | null | undefined;

    const rules = (venue?.booking_rules as { cancellation_notice_hours?: number } | null) ?? null;
    const refundNoticeHours =
      isUnifiedSchedulingVenue(venue?.booking_model) &&
      typeof rules?.cancellation_notice_hours === 'number'
        ? rules.cancellation_notice_hours
        : 48;

    return NextResponse.json({
      booking_id: booking.id,
      venue_id: booking.venue_id,
      venue_name: venue?.name,
      venue_address: venue?.address,
      venue_phone: venue?.phone ?? null,
      booking_date: booking.booking_date,
      booking_time: timeStr,
      party_size: booking.party_size,
      deposit_paid: depositPaid,
      deposit_amount_pence: booking.deposit_amount_pence,
      status: booking.status,
      is_appointment: isAppointment,
      practitioner_id: isAppointment && practitionerIdForUi ? practitionerIdForUi : null,
      appointment_service_id: isAppointment && serviceIdForUi ? serviceIdForUi : null,
      practitioner_name,
      appointment_service_name,
      refund_notice_hours: refundNoticeHours,
    });
  } catch (err) {
    console.error('GET /api/confirm failed:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/confirm \u2014 action: confirm | cancel
 * Body: { booking_id, token, action }.
 * Confirm: set status Confirmed, set confirm_token_used_at.
 * Cancel: set status Cancelled; if before cancellation_deadline trigger refund and set deposit_status Refunded; set confirm_token_used_at; send cancellation_confirmation.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      booking_id: bookingId,
      token,
      hmac,
      action,
      booking_date,
      booking_time,
      party_size,
      practitioner_id: bodyPractitionerId,
      appointment_service_id: bodyAppointmentServiceId,
    } = body as {
      booking_id?: string;
      token?: string;
      hmac?: string;
      action?: string;
      booking_date?: string;
      booking_time?: string;
      party_size?: number;
      practitioner_id?: string;
      appointment_service_id?: string;
    };

    if (!bookingId || (!token && !hmac) || (action !== 'confirm' && action !== 'cancel' && action !== 'modify')) {
      return NextResponse.json({ error: 'Missing or invalid body' }, { status: 400 });
    }

    const supabase = getSupabaseAdminClient();
    const { data: booking, error: bookErr } = await supabase
      .from('bookings')
      .select(
        'id, venue_id, guest_id, booking_date, booking_time, party_size, status, deposit_status, deposit_amount_pence, stripe_payment_intent_id, cancellation_deadline, confirm_token_hash, confirm_token_used_at, service_id, practitioner_id, appointment_service_id, calendar_id, service_item_id, updated_at',
      )
      .eq('id', bookingId)
      .single();

    if (bookErr || !booking) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
    }

    if (hmac) {
      if (!verifyBookingHmac(bookingId, hmac)) {
        return NextResponse.json({ error: 'Invalid link' }, { status: 400 });
      }
    } else if (token) {
      if (booking.confirm_token_used_at) {
        return NextResponse.json({ error: 'This link has already been used' }, { status: 410 });
      }
      if (!verifyConfirmToken(token, booking.confirm_token_hash)) {
        return NextResponse.json({ error: 'Invalid link' }, { status: 400 });
      }
    }

    const now = new Date().toISOString();
    const usedAt = now;

    if (action === 'confirm') {
      const confirmCheck = validateBookingStatusTransition(booking.status as string, 'Confirmed');
      if (!confirmCheck.ok) {
        return NextResponse.json({ error: confirmCheck.error }, { status: 400 });
      }

      const previousStatus = booking.status as string;
      await supabase
        .from('bookings')
        .update({
          status: 'Confirmed',
          confirm_token_used_at: usedAt,
          updated_at: now,
        })
        .eq('id', bookingId);

      await applyBookingLifecycleStatusEffects(supabase, {
        bookingId,
        guestId: booking.guest_id,
        previousStatus,
        nextStatus: 'Confirmed',
        actorId: null,
      });

      return NextResponse.json({ success: true, message: 'You\u2019re confirmed! We look forward to seeing you.' });
    }

    if (action === 'cancel') {
      const cancelCheck = validateBookingStatusTransition(booking.status as string, 'Cancelled');
      if (!cancelCheck.ok) {
        return NextResponse.json({ error: cancelCheck.error }, { status: 400 });
      }

      const previousStatus = booking.status as string;
      const deadline = booking.cancellation_deadline ? new Date(booking.cancellation_deadline) : null;
      const canRefund = deadline && new Date() <= deadline && booking.deposit_status === 'Paid' && booking.stripe_payment_intent_id;

      let refundSucceeded = false;
      if (canRefund) {
        const { data: venue } = await supabase.from('venues').select('stripe_connected_account_id').eq('id', booking.venue_id).single();
        if (venue?.stripe_connected_account_id) {
          try {
            await stripe.refunds.create(
              { payment_intent: booking.stripe_payment_intent_id },
              { stripeAccount: venue.stripe_connected_account_id }
            );
            refundSucceeded = true;
          } catch (refundErr) {
            console.error('Refund failed:', refundErr);
          }
        }
      }

      await supabase
        .from('bookings')
        .update({
          status: 'Cancelled',
          deposit_status: refundSucceeded ? 'Refunded' : booking.deposit_status,
          confirm_token_used_at: usedAt,
          updated_at: now,
        })
        .eq('id', bookingId);

      await applyBookingLifecycleStatusEffects(supabase, {
        bookingId,
        guestId: booking.guest_id,
        previousStatus,
        nextStatus: 'Cancelled',
        actorId: null,
      });

      const { data: venue } = await supabase.from('venues').select('name, address, phone').eq('id', booking.venue_id).single();
      const { data: guest } = await supabase.from('guests').select('name, email, phone').eq('id', booking.guest_id).single();
      const timeStr = typeof booking.booking_time === 'string' ? booking.booking_time.slice(0, 5) : '';

      const depositAmountStr = booking.deposit_amount_pence
        ? `\u00A3${(booking.deposit_amount_pence / 100).toFixed(2)}`
        : null;

      let refund_message: string;
      if (refundSucceeded) {
        refund_message = `Your deposit of ${depositAmountStr} will be refunded to your original payment method within 5-10 business days.`;
      } else if (booking.deposit_status === 'Paid' && !canRefund) {
        refund_message = `Your deposit of ${depositAmountStr} is non-refundable as the cancellation was made less than 48 hours before the reservation.`;
      } else if (booking.deposit_status === 'Paid' && canRefund && !refundSucceeded) {
        refund_message = `We were unable to process your refund automatically. Please contact the venue directly to arrange your refund of ${depositAmountStr}.`;
      } else {
        refund_message = '';
      }

      if (guest && venue?.name) {
        const cancelBookingEmail: BookingEmailData = {
          id: bookingId,
          guest_name: guest.name ?? 'Guest',
          guest_email: guest.email ?? null,
          guest_phone: guest.phone ?? null,
          booking_date: booking.booking_date,
          booking_time: timeStr,
          party_size: booking.party_size,
          deposit_amount_pence: booking.deposit_amount_pence ?? null,
          deposit_status: booking.deposit_status ?? null,
        };
        const cancelVenueEmail: VenueEmailData = {
          name: venue.name,
          address: venue.address ?? null,
          phone: venue.phone ?? null,
        };
        const vid = booking.venue_id;
        const refundMsg = refund_message || null;
        after(async () => {
          try {
            const enriched = await enrichBookingEmailForAppointment(supabase, bookingId, cancelBookingEmail);
            await sendCancellationNotification(enriched, cancelVenueEmail, vid, refundMsg);
          } catch (commsErr) {
            console.error('Cancellation confirmation comms failed:', commsErr);
          }
        });
      }

      return NextResponse.json({
        success: true,
        message: refundSucceeded ? 'Booking cancelled. Your deposit will be refunded.' : 'Booking cancelled.',
        refund_message,
        refund_eligible: refundSucceeded,
        deposit_amount_str: depositAmountStr,
      });
    }

    if (action === 'modify') {
      const modifiableStatuses = ['Confirmed', 'Pending'];
      if (!modifiableStatuses.includes(booking.status as string)) {
        return NextResponse.json({ error: 'This booking cannot be modified.' }, { status: 400 });
      }

      const venueMode = await resolveVenueMode(supabase, booking.venue_id);

      if (isUnifiedSchedulingVenue(venueMode.bookingModel)) {
        if (!booking_date || !booking_time || !bodyPractitionerId || !bodyAppointmentServiceId) {
          return NextResponse.json(
            {
              error:
                'booking_date, booking_time, practitioner_id, and appointment_service_id are required for appointment changes.',
            },
            { status: 400 },
          );
        }

        const newDate = booking_date;
        const newTimeRaw = booking_time;
        const newTime = newTimeRaw.length === 5 ? newTimeRaw + ':00' : newTimeRaw;
        const timeStr = newTime.slice(0, 5);
        const newPartySize = Number(party_size ?? booking.party_size);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(newDate) || newPartySize < 1 || newPartySize > 50) {
          return NextResponse.json({ error: 'Invalid date or party size.' }, { status: 400 });
        }

        const { data: venueAppt } = await supabase
          .from('venues')
          .select('timezone, booking_rules, opening_hours')
          .eq('id', booking.venue_id)
          .single();

        const input = await fetchAppointmentInput({
          supabase,
          venueId: booking.venue_id,
          date: newDate,
          practitionerId: bodyPractitionerId,
          serviceId: bodyAppointmentServiceId,
        });
        input.existingBookings = input.existingBookings.filter((b) => b.id !== bookingId);
        attachVenueClockToAppointmentInput(input, venueAppt ?? {});
        const result = computeAppointmentAvailability(input);
        const prac = result.practitioners.find((p) => p.id === bodyPractitionerId);
        const slotAvailable = prac?.slots.some(
          (s) => s.start_time === timeStr && s.service_id === bodyAppointmentServiceId,
        );
        if (!slotAvailable) {
          return NextResponse.json(
            { error: 'This appointment slot is no longer available. Please choose another time or service.' },
            { status: 409 },
          );
        }

        const baseSvc = input.services.find((s) => s.id === bodyAppointmentServiceId);
        const ps = input.practitionerServices.find(
          (row) => row.practitioner_id === bodyPractitionerId && row.service_id === bodyAppointmentServiceId,
        );
        const svc = baseSvc ? mergeAppointmentServiceWithPractitionerLink(baseSvc, ps) : undefined;

        let estimatedEndTime: string | null = null;
        if (svc) {
          const [y, mo, d] = newDate.split('-').map(Number);
          const [hh, mm] = timeStr.split(':').map(Number);
          const endDate = new Date(Date.UTC(y!, mo! - 1, d!, hh!, mm!, 0));
          endDate.setMinutes(endDate.getMinutes() + svc.duration_minutes);
          estimatedEndTime = endDate.toISOString();
        }

        const bookingRulesJson = (venueAppt?.booking_rules as { cancellation_notice_hours?: number } | null) ?? {};
        const refundWindowHours =
          typeof bookingRulesJson.cancellation_notice_hours === 'number' ? bookingRulesJson.cancellation_notice_hours : 48;
        const cancellation_deadline = cancellationDeadlineHoursBefore(newDate, newTime, refundWindowHours);
        const cancellation_policy_snapshot = {
          refund_window_hours: refundWindowHours,
          policy: `Full refund if cancelled ${refundWindowHours}+ hours before appointment start. No refund within ${refundWindowHours} hours of the appointment or for no-shows.`,
        };

        const nowIso = new Date().toISOString();
        const prevUpdatedAt = booking.updated_at as string;
        const { data: apptUpdated, error: apptUpdErr } = await supabase
          .from('bookings')
          .update({
            booking_date: newDate,
            booking_time: newTime,
            party_size: newPartySize,
            // Unified scheduling stores staff/service on calendar_id + service_item_id; legacy Model B uses practitioner_id + appointment_service_id.
            calendar_id: bodyPractitionerId,
            service_item_id: bodyAppointmentServiceId,
            practitioner_id: null,
            appointment_service_id: null,
            estimated_end_time: estimatedEndTime,
            cancellation_deadline,
            cancellation_policy_snapshot,
            updated_at: nowIso,
          })
          .eq('id', bookingId)
          .eq('updated_at', prevUpdatedAt)
          .select('id')
          .maybeSingle();

        if (apptUpdErr) {
          console.error('confirm modify (appointment) update failed:', apptUpdErr);
          return NextResponse.json({ error: 'Failed to update booking.' }, { status: 500 });
        }
        if (!apptUpdated) {
          return NextResponse.json(
            { error: 'This booking was updated elsewhere. Refresh the page and try again.' },
            { status: 412 },
          );
        }

        return NextResponse.json({
          success: true,
          message: 'Your appointment has been updated.',
          booking_date: newDate,
          booking_time: timeStr,
          party_size: newPartySize,
          practitioner_id: bodyPractitionerId,
          appointment_service_id: bodyAppointmentServiceId,
        });
      }

      if (!booking_date || !booking_time || party_size == null) {
        return NextResponse.json({ error: 'booking_date, booking_time and party_size are required for modification.' }, { status: 400 });
      }

      const newDate = booking_date;
      const newTimeRaw = booking_time;
      const newTime = newTimeRaw.length === 5 ? newTimeRaw + ':00' : newTimeRaw;
      const newPartySize = Number(party_size);

      if (!/^\d{4}-\d{2}-\d{2}$/.test(newDate) || newPartySize < 1 || newPartySize > 50) {
        return NextResponse.json({ error: 'Invalid date or party size.' }, { status: 400 });
      }

      const timeStr = newTime.slice(0, 5);

      if (venueMode.availabilityEngine !== 'service') {
        return NextResponse.json({ error: AVAILABILITY_SETUP_REQUIRED_MESSAGE }, { status: 503 });
      }

      const engineInput = await fetchEngineInput({
        supabase,
        venueId: booking.venue_id,
        date: newDate,
        partySize: newPartySize,
      });
      engineInput.bookings = engineInput.bookings.filter((b) => b.id !== bookingId);

      const results = computeAvailability(engineInput);
      const allSlots = results.flatMap((r) => r.slots);
      const largeParty = results.some((r) => r.large_party_redirect);
      const largePartyMsg = results.find((r) => r.large_party_message)?.large_party_message;

      if (largeParty) {
        return NextResponse.json({
          error: largePartyMsg ?? 'For parties of this size, please call the restaurant directly.',
        }, { status: 400 });
      }

      const slot = allSlots.find((s) => s.start_time === timeStr && (!booking.service_id || s.service_id === booking.service_id));
      if (!slot || slot.available_covers < newPartySize) {
        return NextResponse.json(
          { error: 'The selected date/time is not available for this party size.' },
          { status: 409 },
        );
      }

      const now = new Date().toISOString();
      const prevUpdatedAt = booking.updated_at as string;
      const { data: tableUpdated, error: tableUpdErr } = await supabase
        .from('bookings')
        .update({
          booking_date: newDate,
          booking_time: newTime,
          party_size: newPartySize,
          updated_at: now,
        })
        .eq('id', bookingId)
        .eq('updated_at', prevUpdatedAt)
        .select('id')
        .maybeSingle();

      if (tableUpdErr) {
        console.error('confirm modify (table) update failed:', tableUpdErr);
        return NextResponse.json({ error: 'Failed to update booking.' }, { status: 500 });
      }
      if (!tableUpdated) {
        return NextResponse.json(
          { error: 'This booking was updated elsewhere. Refresh the page and try again.' },
          { status: 412 },
        );
      }

      return NextResponse.json({
        success: true,
        message: 'Your booking has been updated.',
        booking_date: newDate,
        booking_time: timeStr,
        party_size: newPartySize,
      });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (err) {
    console.error('POST /api/confirm failed:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
