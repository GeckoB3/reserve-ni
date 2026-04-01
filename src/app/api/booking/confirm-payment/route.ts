import { NextRequest, NextResponse, after } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase';
import { stripe } from '@/lib/stripe';
import { generateConfirmToken, hashConfirmToken } from '@/lib/confirm-token';
import { validateBookingStatusTransition } from '@/lib/table-management/lifecycle';
import { sendBookingConfirmationNotifications, sendDepositConfirmationEmail } from '@/lib/communications/send-templated';
import { isSelfServeBookingSource } from '@/lib/booking-source';
import { enrichBookingEmailForAppointment } from '@/lib/emails/booking-email-enrichment';
import { resolvePublicSiteOriginFromRequest } from '@/lib/public-base-url';

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
      .select('name, stripe_connected_account_id, address')
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

    const transitionCheck = validateBookingStatusTransition(booking.status as string, 'Confirmed');
    if (!transitionCheck.ok) {
      return NextResponse.json({ error: transitionCheck.error }, { status: 400 });
    }

    // Payment verified — confirm every booking row that shares this PaymentIntent
    // (group / multi-service deposits store the same PI on each segment).
    const { data: statusRows } = await supabase
      .from('bookings')
      .update({
        status: 'Confirmed',
        deposit_status: 'Paid',
        updated_at: new Date().toISOString(),
      })
      .eq('stripe_payment_intent_id', booking.stripe_payment_intent_id)
      .eq('venue_id', booking.venue_id)
      .eq('status', 'Pending')
      .select('id');

    if (!statusRows?.length) {
      console.log('confirm-payment: booking already confirmed by webhook');
      return NextResponse.json({ confirmed: true, already_confirmed: true });
    }

    // Save guest_email on the booking if provided
    if (guestEmail) {
      await supabase
        .from('bookings')
        .update({ guest_email: guestEmail, updated_at: new Date().toISOString() })
        .eq('id', bookingId);
    }

    // Generate a manage-booking token. Use an atomic WHERE clause so that if
    // the webhook fires simultaneously, only the first writer wins.
    let manageToken: string | undefined;
    const candidateToken = generateConfirmToken();
    const { data: tokenRows } = await supabase
      .from('bookings')
      .update({
        confirm_token_hash: hashConfirmToken(candidateToken),
        updated_at: new Date().toISOString(),
      })
      .eq('id', bookingId)
      .is('confirm_token_hash', null)
      .select('id');

    if (tokenRows && tokenRows.length > 0) {
      manageToken = candidateToken;
    } else {
      console.log('confirm-payment: token already set by another process, skipping manage link');
    }

    const { data: guest } = await supabase
      .from('guests')
      .select('name, email, phone')
      .eq('id', booking.guest_id)
      .single();

    const baseUrl = resolvePublicSiteOriginFromRequest(request);
    const manageBookingLink = manageToken
      ? `${baseUrl}/manage/${bookingId}/${encodeURIComponent(manageToken)}`
      : undefined;
    const bookingTime = typeof booking.booking_time === 'string'
      ? booking.booking_time.slice(0, 5)
      : booking.booking_time;

    const recipientEmail = guestEmail || guest?.email;
    const venueData = { name: venue.name, address: venue.address ?? undefined };
    const bookingData = {
      id: booking.id,
      guest_name: guest?.name ?? guestEmail ?? 'Guest',
      guest_email: recipientEmail ?? null,
      guest_phone: guest?.phone ?? null,
      booking_date: booking.booking_date,
      booking_time: bookingTime,
      party_size: booking.party_size,
      deposit_amount_pence: booking.deposit_amount_pence ?? null,
      deposit_status: 'Paid' as const,
      refund_cutoff: booking.cancellation_deadline ?? null,
      manage_booking_link: manageBookingLink ?? null,
    };

    after(async () => {
      try {
        const enriched = await enrichBookingEmailForAppointment(supabase, bookingId, bookingData);
        const { email: confEmail, sms: confSms } = await sendBookingConfirmationNotifications(
          enriched,
          venueData,
          booking.venue_id,
        );
        if (!confEmail.sent) console.warn('[after] confirm-payment confirmation email not sent:', confEmail.reason);
        if (!confSms.sent && confSms.reason !== 'skipped' && confSms.reason !== 'no_phone') {
          console.warn('[after] confirm-payment confirmation SMS not sent:', confSms.reason);
        }
      } catch (err) {
        console.error('[after] confirm-payment confirmation notifications failed:', err);
      }

      const skipDepositReceipt = isSelfServeBookingSource(booking.source as string | null);
      if (recipientEmail && booking.deposit_amount_pence && !skipDepositReceipt) {
        try {
          const enrichedDep = await enrichBookingEmailForAppointment(supabase, bookingId, bookingData);
          const depResult = await sendDepositConfirmationEmail(enrichedDep, venueData, booking.venue_id);
          if (!depResult.sent) console.warn('[after] confirm-payment deposit email not sent:', depResult.reason);
        } catch (err) {
          console.error('[after] confirm-payment deposit email failed:', err);
        }
      }
    });

    return NextResponse.json({ confirmed: true });
  } catch (err) {
    console.error('POST /api/booking/confirm-payment failed:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
