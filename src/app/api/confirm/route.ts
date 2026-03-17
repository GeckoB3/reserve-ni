import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase';
import { stripe } from '@/lib/stripe';
import { sendCommunication } from '@/lib/communications';
import { verifyConfirmToken } from '@/lib/confirm-token';
import { verifyBookingHmac } from '@/lib/short-manage-link';
import { validateBookingStatusTransition, applyBookingLifecycleStatusEffects } from '@/lib/table-management/lifecycle';
import type { BookingStatus } from '@/lib/table-management/booking-status';
import { computeAvailability, fetchEngineInput, getAvailableSlots } from '@/lib/availability';
import { resolveVenueMode } from '@/lib/venue-mode';
import type { VenueForAvailability, BookingForAvailability } from '@/types/availability';

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
      .select('id, venue_id, guest_id, booking_date, booking_time, party_size, status, deposit_status, deposit_amount_pence, confirm_token_hash, confirm_token_used_at')
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

    const { data: venue } = await supabase.from('venues').select('name, address, phone').eq('id', booking.venue_id).single();
    const depositPaid = booking.deposit_status === 'Paid';
    const timeStr = typeof booking.booking_time === 'string' ? booking.booking_time.slice(0, 5) : '';

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
    const { booking_id: bookingId, token, hmac, action, booking_date, booking_time, party_size } = body as {
      booking_id?: string; token?: string; hmac?: string; action?: string;
      booking_date?: string; booking_time?: string; party_size?: number;
    };

    if (!bookingId || (!token && !hmac) || (action !== 'confirm' && action !== 'cancel' && action !== 'modify')) {
      return NextResponse.json({ error: 'Missing or invalid body' }, { status: 400 });
    }

    const supabase = getSupabaseAdminClient();
    const { data: booking, error: bookErr } = await supabase
      .from('bookings')
      .select('id, venue_id, guest_id, booking_date, booking_time, party_size, status, deposit_status, deposit_amount_pence, stripe_payment_intent_id, cancellation_deadline, confirm_token_hash, confirm_token_used_at, service_id')
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

      const { data: venue } = await supabase.from('venues').select('name').eq('id', booking.venue_id).single();
      const { data: guest } = await supabase.from('guests').select('name, email, phone').eq('id', booking.guest_id).single();
      const timeStr = typeof booking.booking_time === 'string' ? booking.booking_time.slice(0, 5) : '';

      const depositAmountStr = booking.deposit_amount_pence
        ? `\u00A3${(booking.deposit_amount_pence / 100).toFixed(2)}`
        : null;

      let refund_message: string;
      if (refundSucceeded) {
        refund_message = `Your deposit of ${depositAmountStr} will be refunded to your original payment method within 5\u201310 business days.`;
      } else if (booking.deposit_status === 'Paid' && !canRefund) {
        refund_message = `Your deposit of ${depositAmountStr} is non-refundable as the cancellation was made less than 48 hours before the reservation.`;
      } else if (booking.deposit_status === 'Paid' && canRefund && !refundSucceeded) {
        refund_message = `We were unable to process your refund automatically. Please contact the venue directly to arrange your refund of ${depositAmountStr}.`;
      } else {
        refund_message = '';
      }

      try {
        await sendCommunication({
          type: 'cancellation_confirmation',
          recipient: { email: guest?.email ?? undefined, phone: guest?.phone ?? undefined },
          payload: {
            guest_name: guest?.name,
            venue_name: venue?.name,
            booking_date: booking.booking_date,
            booking_time: timeStr,
            party_size: booking.party_size,
            refund_message: refund_message || undefined,
          },
        });
      } catch (commsErr) {
        console.error('Cancellation confirmation comms failed:', commsErr);
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

      if (!booking_date || !booking_time || !party_size) {
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
      const venueMode = await resolveVenueMode(supabase, booking.venue_id);

      if (venueMode.availabilityEngine === 'service') {
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
      } else {
        const [venueRes, bookingsRes] = await Promise.all([
          supabase.from('venues').select('id, opening_hours, availability_config, timezone, booking_rules').eq('id', booking.venue_id).single(),
          supabase.from('bookings')
            .select('id, booking_date, booking_time, party_size, status')
            .eq('venue_id', booking.venue_id)
            .eq('booking_date', newDate),
        ]);

        if (!venueRes.data) {
          return NextResponse.json({ error: 'Venue not found' }, { status: 500 });
        }

        const rules = (venueRes.data.booking_rules ?? {}) as { min_party_size?: number; max_party_size?: number; min_notice_hours?: number };
        if (rules.max_party_size && newPartySize > rules.max_party_size) {
          return NextResponse.json({
            error: `Online bookings are limited to ${rules.max_party_size} guests. Please call the restaurant for larger parties.`,
          }, { status: 400 });
        }
        if (rules.min_party_size && newPartySize < rules.min_party_size) {
          return NextResponse.json({
            error: `Minimum party size for online bookings is ${rules.min_party_size}.`,
          }, { status: 400 });
        }

        const bookingsForAvail: BookingForAvailability[] = (bookingsRes.data ?? [])
          .filter((b: { id: string }) => b.id !== bookingId)
          .filter((b: { status: string }) => ['Confirmed', 'Pending'].includes(b.status))
          .map((b: { id: string; booking_date: string; booking_time: string; party_size: number; status: string }) => ({
            id: b.id,
            booking_date: b.booking_date,
            booking_time: typeof b.booking_time === 'string' ? b.booking_time.slice(0, 5) : '00:00',
            party_size: b.party_size,
            status: b.status,
          }));

        const venueForAvail: VenueForAvailability = {
          id: venueRes.data.id,
          opening_hours: venueRes.data.opening_hours,
          availability_config: venueRes.data.availability_config,
          timezone: venueRes.data.timezone ?? 'Europe/London',
        };

        const slots = getAvailableSlots(venueForAvail, newDate, bookingsForAvail);
        const slot = slots.find((s) => s.start_time === timeStr || s.key === timeStr);
        if (!slot || slot.available_covers < newPartySize) {
          return NextResponse.json(
            { error: 'The selected date/time is not available for this party size.' },
            { status: 409 },
          );
        }
      }

      const now = new Date().toISOString();
      await supabase
        .from('bookings')
        .update({
          booking_date: newDate,
          booking_time: newTime,
          party_size: newPartySize,
          updated_at: now,
        })
        .eq('id', bookingId);

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
