import { NextRequest, NextResponse, after } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase';
import { stripe } from '@/lib/stripe';
import { validateBookingStatusTransition } from '@/lib/table-management/lifecycle';
import {
  confirmBookingsForSucceededPaymentIntent,
  sendDepositPaidBookingComms,
} from '@/lib/booking/confirm-deposit-payment';
import { venueRowToEmailData } from '@/lib/emails/venue-email-data';

/**
 * POST /api/booking/confirm-payment
 *
 * Called by the client after Stripe.confirmPayment() succeeds. Verifies the
 * PaymentIntent status directly with Stripe and, if succeeded, confirms the
 * booking, sends confirmation comms, and returns the manage booking link.
 *
 * This endpoint is the primary confirmation path. The webhook handler is kept
 * as a backup for edge cases (3D Secure redirects, delayed confirmations).
 *
 * No Appointments Light `past_due` guard: same reasoning as GET /api/booking/pay (complete existing deposits).
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const bookingId = body.booking_id as string | undefined;
    const guestEmail = (body.guest_email as string | undefined)?.trim() || null;
    if (!bookingId) {
      return NextResponse.json({ error: 'Missing booking_id' }, { status: 400 });
    }

    const supabase = getSupabaseAdminClient();

    const { data: booking, error: bookErr } = await supabase
      .from('bookings')
      .select('id, venue_id, guest_id, status, deposit_status, stripe_payment_intent_id, booking_date, booking_time, party_size, cancellation_deadline, deposit_amount_pence, dietary_notes, occasion, confirm_token_hash, source')
      .eq('id', bookingId)
      .single();

    if (bookErr || !booking) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
    }

    // Already moved past Pending (e.g. by webhook) - return success without re-processing.
    // Both `Booked` and `Confirmed` indicate the deposit has been credited and
    // the booking is held; only Pending should re-trigger the confirm flow.
    if (
      (booking.status === 'Booked' || booking.status === 'Confirmed') &&
      booking.deposit_status === 'Paid'
    ) {
      return NextResponse.json({ confirmed: true, already_confirmed: true });
    }

    if (!booking.stripe_payment_intent_id) {
      return NextResponse.json({ error: 'No payment intent linked to this booking' }, { status: 400 });
    }

    // Retrieve the venue's connected account to query the PaymentIntent.
    const { data: venue } = await supabase
      .from('venues')
      .select(
        'name, stripe_connected_account_id, address, email, reply_to_email, logo_url, cover_photo_url, website_url, timezone',
      )
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
          ? 'Payment is still processing \u2014 it will be confirmed shortly.'
          : 'Payment has not succeeded yet.',
      });
    }

    const transitionCheck = validateBookingStatusTransition(booking.status as string, 'Booked');
    if (!transitionCheck.ok) {
      return NextResponse.json({ error: transitionCheck.error }, { status: 400 });
    }

    const confirmResult = await confirmBookingsForSucceededPaymentIntent(supabase, {
      paymentIntentId: booking.stripe_payment_intent_id,
      venueId: booking.venue_id,
      guestEmail,
    });

    if (!confirmResult.ok) {
      console.error('[confirm-payment] booking confirm failed:', confirmResult.reason, { bookingId });
      return NextResponse.json({ error: 'Failed to confirm booking after payment' }, { status: 500 });
    }

    if (confirmResult.alreadyConfirmed) {
      console.log('confirm-payment: booking already marked Booked by webhook');
      return NextResponse.json({ confirmed: true, already_confirmed: true });
    }

    const confirmedIds = confirmResult.confirmedIds;

    const { data: guest } = await supabase
      .from('guests')
      .select('first_name, last_name, email, phone')
      .eq('id', booking.guest_id)
      .single();

    const venueData = venueRowToEmailData({
      name: venue.name,
      address: venue.address ?? null,
      email: venue.email ?? null,
      reply_to_email: venue.reply_to_email ?? null,
      logo_url: (venue as { logo_url?: string | null }).logo_url ?? null,
      cover_photo_url: (venue as { cover_photo_url?: string | null }).cover_photo_url ?? null,
      website_url: (venue as { website_url?: string | null }).website_url ?? null,
      timezone: (venue as { timezone?: string | null }).timezone ?? null,
    });

    after(async () => {
      await sendDepositPaidBookingComms(supabase, {
        confirmedIds,
        venueId: booking.venue_id,
        venueData,
        guest,
        guestEmail,
      });
    });

    return NextResponse.json({ confirmed: true });
  } catch (err) {
    console.error('POST /api/booking/confirm-payment failed:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
