import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase';
import { stripe } from '@/lib/stripe';
import { sendCommunication } from '@/lib/communications';
import { verifyConfirmToken } from '@/lib/confirm-token';

/**
 * GET /api/confirm?booking_id=uuid&token=xxx
 * Returns booking details for confirm-or-cancel page if token is valid and not used.
 */
export async function GET(request: NextRequest) {
  try {
    const bookingId = request.nextUrl.searchParams.get('booking_id');
    const token = request.nextUrl.searchParams.get('token');
    if (!bookingId || !token) {
      return NextResponse.json({ error: 'Missing booking_id or token' }, { status: 400 });
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

    if (booking.confirm_token_used_at) {
      return NextResponse.json({ error: 'This link has already been used' }, { status: 410 });
    }

    if (!verifyConfirmToken(token, booking.confirm_token_hash)) {
      return NextResponse.json({ error: 'Invalid link' }, { status: 400 });
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
 * POST /api/confirm — action: confirm | cancel
 * Body: { booking_id, token, action }.
 * Confirm: set status Confirmed, set confirm_token_used_at.
 * Cancel: set status Cancelled; if before cancellation_deadline trigger refund and set deposit_status Refunded; set confirm_token_used_at; send cancellation_confirmation.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { booking_id: bookingId, token, action } = body as { booking_id?: string; token?: string; action?: string };

    if (!bookingId || !token || (action !== 'confirm' && action !== 'cancel')) {
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

    if (booking.confirm_token_used_at) {
      return NextResponse.json({ error: 'This link has already been used' }, { status: 410 });
    }

    if (!verifyConfirmToken(token, booking.confirm_token_hash)) {
      return NextResponse.json({ error: 'Invalid link' }, { status: 400 });
    }

    const now = new Date().toISOString();
    const usedAt = now;

    if (action === 'confirm') {
      await supabase
        .from('bookings')
        .update({
          status: 'Confirmed',
          confirm_token_used_at: usedAt,
          updated_at: now,
        })
        .eq('id', bookingId);

      return NextResponse.json({ success: true, message: 'You’re confirmed! We look forward to seeing you.' });
    }

    if (action === 'cancel') {
      const deadline = booking.cancellation_deadline ? new Date(booking.cancellation_deadline) : null;
      const canRefund = deadline && new Date() <= deadline && booking.deposit_status === 'Paid' && booking.stripe_payment_intent_id;

      if (canRefund) {
        const { data: venue } = await supabase.from('venues').select('stripe_connected_account_id').eq('id', booking.venue_id).single();
        if (venue?.stripe_connected_account_id) {
          try {
            await stripe.refunds.create(
              { payment_intent: booking.stripe_payment_intent_id },
              { stripeAccount: venue.stripe_connected_account_id }
            );
          } catch (refundErr) {
            console.error('Refund failed:', refundErr);
          }
        }
      }

      await supabase
        .from('bookings')
        .update({
          status: 'Cancelled',
          deposit_status: canRefund ? 'Refunded' : booking.deposit_status,
          confirm_token_used_at: usedAt,
          updated_at: now,
        })
        .eq('id', bookingId);

      const { data: venue } = await supabase.from('venues').select('name').eq('id', booking.venue_id).single();
      const { data: guest } = await supabase.from('guests').select('name, email, phone').eq('id', booking.guest_id).single();
      const timeStr = typeof booking.booking_time === 'string' ? booking.booking_time.slice(0, 5) : '';

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
            deposit_amount: canRefund && booking.deposit_amount_pence ? (booking.deposit_amount_pence / 100).toFixed(2) : undefined,
          },
        });
      } catch (commsErr) {
        console.error('Cancellation confirmation comms failed:', commsErr);
      }

      return NextResponse.json({
        success: true,
        message: canRefund ? 'Booking cancelled. Your deposit will be refunded.' : 'Booking cancelled.',
      });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (err) {
    console.error('POST /api/confirm failed:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
