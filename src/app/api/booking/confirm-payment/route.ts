import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase';
import { stripe } from '@/lib/stripe';
import { sendCommunication } from '@/lib/communications';
import { generateConfirmToken, hashConfirmToken } from '@/lib/confirm-token';

/**
 * POST /api/booking/confirm-payment
 *
 * Called by the client after Stripe.confirmPayment() succeeds. Verifies the
 * PaymentIntent status directly with Stripe and, if succeeded, confirms the
 * booking, sends confirmation comms, and returns the manage booking link.
 *
 * This endpoint is the primary confirmation path. The webhook handler is kept
 * as a backup for edge cases (3D Secure redirects, delayed confirmations).
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const bookingId = body.booking_id as string | undefined;
    if (!bookingId) {
      return NextResponse.json({ error: 'Missing booking_id' }, { status: 400 });
    }

    const supabase = getSupabaseAdminClient();

    const { data: booking, error: bookErr } = await supabase
      .from('bookings')
      .select('id, venue_id, guest_id, status, deposit_status, stripe_payment_intent_id, booking_date, booking_time, party_size, cancellation_deadline, deposit_amount_pence, dietary_notes, occasion, confirm_token_hash')
      .eq('id', bookingId)
      .single();

    if (bookErr || !booking) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
    }

    // Already confirmed (e.g. by webhook) — return success without re-processing.
    if (booking.status === 'Confirmed' && booking.deposit_status === 'Paid') {
      return NextResponse.json({ confirmed: true, already_confirmed: true });
    }

    if (!booking.stripe_payment_intent_id) {
      return NextResponse.json({ error: 'No payment intent linked to this booking' }, { status: 400 });
    }

    // Retrieve the venue's connected account to query the PaymentIntent.
    const { data: venue } = await supabase
      .from('venues')
      .select('name, stripe_connected_account_id')
      .eq('id', booking.venue_id)
      .single();

    if (!venue?.stripe_connected_account_id) {
      return NextResponse.json({ error: 'Venue Stripe account not found' }, { status: 500 });
    }

    // Verify the PaymentIntent status directly with Stripe on the connected account.
    const pi = await stripe.paymentIntents.retrieve(
      booking.stripe_payment_intent_id,
      { stripeAccount: venue.stripe_connected_account_id },
    );

    if (pi.status !== 'succeeded') {
      return NextResponse.json({
        confirmed: false,
        payment_status: pi.status,
        message: pi.status === 'processing'
          ? 'Payment is still processing — it will be confirmed shortly.'
          : 'Payment has not succeeded yet.',
      });
    }

    // Payment verified — confirm the booking.
    await supabase
      .from('bookings')
      .update({
        status: 'Confirmed',
        deposit_status: 'Paid',
        updated_at: new Date().toISOString(),
      })
      .eq('id', bookingId);

    // Generate a manage-booking token if one doesn't exist yet.
    let manageToken: string | undefined;
    if (!booking.confirm_token_hash) {
      manageToken = generateConfirmToken();
      await supabase
        .from('bookings')
        .update({
          confirm_token_hash: hashConfirmToken(manageToken),
          updated_at: new Date().toISOString(),
        })
        .eq('id', bookingId);
    }

    const { data: guest } = await supabase
      .from('guests')
      .select('name, email, phone')
      .eq('id', booking.guest_id)
      .single();

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL
      || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : request.nextUrl.origin);
    const manageBookingLink = manageToken
      ? `${baseUrl}/manage/${bookingId}/${encodeURIComponent(manageToken)}`
      : undefined;
    const depositAmount = booking.deposit_amount_pence != null
      ? (booking.deposit_amount_pence / 100).toFixed(2)
      : undefined;
    const bookingTime = typeof booking.booking_time === 'string'
      ? booking.booking_time.slice(0, 5)
      : booking.booking_time;

    try {
      await sendCommunication({
        type: 'booking_confirmation',
        recipient: { email: guest?.email ?? undefined, phone: guest?.phone ?? undefined },
        payload: {
          guest_name: guest?.name,
          venue_name: venue.name,
          booking_date: booking.booking_date,
          booking_time: bookingTime,
          party_size: booking.party_size,
          cancellation_deadline: booking.cancellation_deadline,
          deposit_amount: depositAmount,
          dietary_notes: booking.dietary_notes ?? undefined,
          occasion: booking.occasion ?? undefined,
          manage_booking_link: manageBookingLink,
        },
      });
    } catch (commsErr) {
      console.error('confirm-payment: comms failed (booking still confirmed):', commsErr);
    }

    return NextResponse.json({ confirmed: true });
  } catch (err) {
    console.error('POST /api/booking/confirm-payment failed:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
