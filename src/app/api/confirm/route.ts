import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase';
import { stripe } from '@/lib/stripe';
import { sendCommunication } from '@/lib/communications';
import { verifyConfirmToken } from '@/lib/confirm-token';
import { verifyBookingHmac } from '@/lib/short-manage-link';
import { validateBookingStatusTransition, applyBookingLifecycleStatusEffects } from '@/lib/table-management/lifecycle';
import type { BookingStatus } from '@/lib/table-management/booking-status';

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

    const { data: venue } = await supabase.from('venues').select('name, address').eq('id', booking.venue_id).single();
    const depositPaid = booking.deposit_status === 'Paid';
    const timeStr = typeof booking.booking_time === 'string' ? booking.booking_time.slice(0, 5) : '';

    return NextResponse.json({
      booking_id: booking.id,
      venue_name: venue?.name,
      venue_address: venue?.address,
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
    const { booking_id: bookingId, token, hmac, action } = body as { booking_id?: string; token?: string; hmac?: string; action?: string };

    if (!bookingId || (!token && !hmac) || (action !== 'confirm' && action !== 'cancel')) {
      return NextResponse.json({ error: 'Missing or invalid body' }, { status: 400 });
    }

    const supabase = getSupabaseAdminClient();
    const { data: booking, error: bookErr } = await supabase
      .from('bookings')
      .select('id, venue_id, guest_id, booking_date, booking_time, party_size, status, deposit_status, deposit_amount_pence, stripe_payment_intent_id, cancellation_deadline, confirm_token_hash, confirm_token_used_at')
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

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (err) {
    console.error('POST /api/confirm failed:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
