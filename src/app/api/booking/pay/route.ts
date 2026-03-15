import { NextRequest, NextResponse } from 'next/server';
import { createHmac } from 'crypto';
import { getSupabaseAdminClient } from '@/lib/supabase';
import { stripe } from '@/lib/stripe';

/**
 * GET /api/booking/pay?t=token
 * Returns client_secret for the PaymentIntent associated with the booking.
 * Token is signed payload booking_id:exp (24h expiry).
 */
export async function GET(request: NextRequest) {
  try {
    const token = request.nextUrl.searchParams.get('t');
    if (!token?.trim()) {
      return NextResponse.json({ error: 'Missing token' }, { status: 400 });
    }

    const parts = token.trim().split('.');
    if (parts.length !== 2) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 400 });
    }

    const secret = process.env.PAYMENT_TOKEN_SECRET || process.env.STRIPE_SECRET_KEY || 'dev-secret';
    const payload = Buffer.from(parts[0]!, 'base64url').toString('utf8');
    const sig = createHmac('sha256', secret).update(payload).digest('base64url');
    if (sig !== parts[1]) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 400 });
    }

    const [bookingId, expStr] = payload.split(':');
    const exp = parseInt(expStr ?? '0', 10);
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
