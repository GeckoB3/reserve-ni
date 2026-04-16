import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase';
import { stripe } from '@/lib/stripe';
import { verifyPaymentLinkToken } from '@/lib/payment-token';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';

/**
 * GET /api/booking/pay?t=token
 * Returns client_secret for the PaymentIntent associated with the booking.
 * Token is signed payload booking_id:exp (24h expiry).
 *
 * No Appointments Light `past_due` guard: guests must finish in-flight deposit PaymentIntents for
 * bookings created before the venue entered past_due (new bookings are already blocked at create).
 */
export async function GET(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    const rl = checkRateLimit(ip, 'booking-pay', 60, 60_000);
    if (!rl.ok) {
      return NextResponse.json(
        { error: 'Too many requests. Try again shortly.' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
      );
    }

    const token = request.nextUrl.searchParams.get('t');
    if (!token?.trim()) {
      return NextResponse.json({ error: 'Missing token' }, { status: 400 });
    }

    const verified = verifyPaymentLinkToken(token);
    if (!verified.ok && verified.reason === 'misconfigured') {
      console.error('GET /api/booking/pay: PAYMENT_TOKEN_SECRET not set');
      return NextResponse.json({ error: 'Service temporarily unavailable' }, { status: 503 });
    }
    if (!verified.ok) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 400 });
    }

    const { bookingId, exp } = verified;
    if (Date.now() > exp || !bookingId) {
      return NextResponse.json({ error: 'Link expired' }, { status: 400 });
    }

    const supabase = getSupabaseAdminClient();
    const { data: booking } = await supabase
      .from('bookings')
      .select('id, stripe_payment_intent_id, venue_id, status, booking_date, booking_time, party_size, deposit_amount_pence, guest_email, guest_name, guest_phone, cancellation_deadline, guest_id')
      .eq('id', bookingId)
      .single();

    if (!booking || booking.status !== 'Pending' || !booking.stripe_payment_intent_id) {
      return NextResponse.json({ error: 'Booking not found or already completed' }, { status: 404 });
    }

    const { data: venue } = await supabase
      .from('venues')
      .select('name, stripe_connected_account_id, address')
      .eq('id', booking.venue_id)
      .single();

    if (!venue?.stripe_connected_account_id) {
      return NextResponse.json({ error: 'Venue payment not configured' }, { status: 500 });
    }

    // Resolve guest name from guests table if not on booking directly
    let guestName = booking.guest_name ?? '';
    let guestEmail = booking.guest_email ?? '';
    if (booking.guest_id) {
      const { data: guest } = await supabase
        .from('guests')
        .select('name, email')
        .eq('id', booking.guest_id)
        .single();
      if (guest) {
        if (!guestName) guestName = guest.name ?? '';
        if (!guestEmail) guestEmail = guest.email ?? '';
      }
    }

    const paymentIntent = await stripe.paymentIntents.retrieve(
      booking.stripe_payment_intent_id,
      { stripeAccount: venue.stripe_connected_account_id }
    );

    if (!paymentIntent.client_secret) {
      return NextResponse.json({ error: 'Payment not available' }, { status: 500 });
    }

    return NextResponse.json({
      client_secret: paymentIntent.client_secret,
      stripe_account_id: venue.stripe_connected_account_id,
      booking_id: booking.id,
      venue_name: venue.name,
      venue_address: venue.address ?? null,
      booking_date: booking.booking_date,
      booking_time: typeof booking.booking_time === 'string' ? booking.booking_time.slice(0, 5) : booking.booking_time,
      party_size: booking.party_size,
      deposit_amount_pence: booking.deposit_amount_pence ?? null,
      guest_name: guestName,
      guest_email: guestEmail,
      refund_cutoff: booking.cancellation_deadline ?? null,
    });
  } catch (err) {
    console.error('GET /api/booking/pay failed:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
