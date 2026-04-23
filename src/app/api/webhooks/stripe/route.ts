import { NextRequest, NextResponse, after } from 'next/server';
import Stripe from 'stripe';
import { stripe } from '@/lib/stripe';
import { getSupabaseAdminClient } from '@/lib/supabase';
import { sendCommunication } from '@/lib/communications';
import { generateConfirmToken, hashConfirmToken } from '@/lib/confirm-token';
import { sendBookingConfirmationNotifications, sendDepositConfirmationEmail } from '@/lib/communications/send-templated';
import { venueRowToEmailData } from '@/lib/emails/venue-email-data';
import { enrichBookingEmailForComms } from '@/lib/emails/booking-email-enrichment';
import { isSelfServeBookingSource } from '@/lib/booking-source';
import { createShortManageLink } from '@/lib/short-manage-link';

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
if (!webhookSecret) {
  console.warn('STRIPE_WEBHOOK_SECRET is not set; webhook verification will fail');
}

/**
 * Stripe webhook handler. Idempotent: process each event once (track by stripe_event_id).
 * Verifies signature. Handles: payment_intent.succeeded, payment_intent.payment_failed, charge.refunded.
 */
export async function POST(request: NextRequest) {
  let event: Stripe.Event;

  try {
    const rawBody = await request.text();
    const sig = request.headers.get('stripe-signature');
    if (!sig) {
      console.error('[Stripe webhook] No stripe-signature header');
      return NextResponse.json({ error: 'Missing signature' }, { status: 400 });
    }
    if (!webhookSecret) {
      console.error('[Stripe webhook] STRIPE_WEBHOOK_SECRET is not configured');
      return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
    }
    event = Stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[Stripe webhook] Signature verification failed:', message);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  const supabase = getSupabaseAdminClient();

  const { data: existing } = await supabase
    .from('webhook_events')
    .select('id')
    .eq('stripe_event_id', event.id)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ received: true });
  }

  const connectedAccountId = (event as Stripe.Event & { account?: string }).account;
  console.log(`[Stripe webhook] ${event.type} (event: ${event.id})${connectedAccountId ? ` connected_account: ${connectedAccountId}` : ''}`);

  try {
    if (event.type === 'payment_intent.succeeded') {
      const pi = event.data.object as Stripe.PaymentIntent;
      const bookingId = pi.metadata?.booking_id;
      if (!bookingId) {
        console.warn('payment_intent.succeeded missing booking_id in metadata', pi.id);
        await recordProcessed(supabase, event.id, event.type);
        return NextResponse.json({ received: true });
      }

      const { data: booking } = await supabase
        .from('bookings')
        .select('id, venue_id, guest_id, status, deposit_status, source')
        .eq('id', bookingId)
        .single();

      if (!booking) {
        console.log(`[Stripe webhook] Booking ${bookingId} not found \u2014 skipping`);
        await recordProcessed(supabase, event.id, event.type);
        return NextResponse.json({ received: true });
      }

      // Mark every segment that shares this PaymentIntent as Booked (group / multi-service).
      // Deposit-paid moves Pending → Booked. The new dedicated `Confirmed` status is
      // reserved for explicit attendance confirmation by the guest or staff.
      const { data: updatedRows } = await supabase
        .from('bookings')
        .update({
          status: 'Booked',
          deposit_status: 'Paid',
          updated_at: new Date().toISOString(),
        })
        .eq('stripe_payment_intent_id', pi.id)
        .eq('venue_id', booking.venue_id)
        .eq('status', 'Pending')
        .select('id');

      if (!updatedRows?.length) {
        console.log(`[Stripe webhook] No pending bookings to mark Booked for PI ${pi.id} - may already be processed`);
        await recordProcessed(supabase, event.id, event.type);
        return NextResponse.json({ received: true });
      }

      const { data: bRow } = await supabase.from('bookings').select('confirm_token_hash, booking_date, booking_time, party_size, cancellation_deadline, deposit_amount_pence, dietary_notes, occasion').eq('id', bookingId).single();

      // Atomically set the token only if one doesn't already exist (prevents
      // race condition with the confirm-payment route).
      const candidateToken = generateConfirmToken();
      await supabase.from('bookings').update({
        confirm_token_hash: hashConfirmToken(candidateToken),
        updated_at: new Date().toISOString(),
      }).eq('id', bookingId).is('confirm_token_hash', null).select('id');
      const { data: venue } = await supabase
        .from('venues')
        .select('name, address, email, reply_to_email')
        .eq('id', booking.venue_id)
        .single();
      const { data: guest } = await supabase.from('guests').select('name, email, phone').eq('id', booking.guest_id).single();
      const b = bRow;
      const manageBookingLink = createShortManageLink(bookingId);

      const recipientEmail = guest?.email ?? (b as Record<string, unknown>)?.guest_email as string | null;
      const bookingData = {
        id: bookingId,
        guest_name: guest?.name ?? 'Guest',
        guest_email: recipientEmail ?? null,
        guest_phone: guest?.phone ?? null,
        booking_date: b?.booking_date ?? '',
        booking_time: typeof b?.booking_time === 'string' ? b.booking_time.slice(0, 5) : b?.booking_time ?? '',
        party_size: b?.party_size ?? 2,
        deposit_amount_pence: b?.deposit_amount_pence ?? null,
        deposit_status: 'Paid' as const,
        manage_booking_link: manageBookingLink,
      };
      const venueData = venueRowToEmailData({
        name: venue?.name ?? 'Venue',
        address: venue?.address ?? null,
        email: venue?.email ?? null,
        reply_to_email: venue?.reply_to_email ?? null,
      });

      const venueIdForAfter = booking.venue_id;
      const hasDeposit = Boolean(recipientEmail && b?.deposit_amount_pence);
      const skipDepositReceipt = isSelfServeBookingSource(booking.source as string | null);
      after(async () => {
        try {
          const enriched = await enrichBookingEmailForComms(getSupabaseAdminClient(), bookingId, bookingData);
          const { email: confEmail, sms: confSms } = await sendBookingConfirmationNotifications(
            enriched,
            venueData,
            venueIdForAfter,
          );
          if (!confEmail.sent) console.warn('[after] webhook confirmation email not sent:', confEmail.reason);
          if (!confSms.sent && confSms.reason !== 'skipped' && confSms.reason !== 'no_phone') {
            console.warn('[after] webhook confirmation SMS not sent:', confSms.reason);
          }
        } catch (err) {
          console.error('[after] webhook confirmation notifications failed:', err);
        }

        if (hasDeposit && !skipDepositReceipt) {
          try {
            const enrichedDep = await enrichBookingEmailForComms(getSupabaseAdminClient(), bookingId, bookingData);
            const depResult = await sendDepositConfirmationEmail(enrichedDep, venueData, venueIdForAfter);
            if (!depResult.sent) console.warn('[after] webhook deposit email not sent:', depResult.reason);
          } catch (err) {
            console.error('[after] webhook deposit email failed:', err);
          }
        }
      });
    } else if (event.type === 'payment_intent.payment_failed') {
      const pi = event.data.object as Stripe.PaymentIntent;
      const bookingId = pi.metadata?.booking_id;
      if (bookingId) {
        const { data: booking } = await supabase
          .from('bookings')
          .select('id, venue_id')
          .eq('id', bookingId)
          .maybeSingle();
        await supabase
          .from('bookings')
          .update({ updated_at: new Date().toISOString() })
          .eq('id', bookingId);

        if (booking?.venue_id) {
          const { data: venue } = await supabase
            .from('venues')
            .select('name, kitchen_email')
            .eq('id', booking.venue_id)
            .maybeSingle();
          if (venue?.kitchen_email) {
            try {
              await sendCommunication({
                type: 'custom_message',
                recipient: { email: venue.kitchen_email },
                payload: {
                  venue_name: venue.name ?? 'Venue',
                  message: `Deposit payment failed for booking ${bookingId}. Please follow up with the guest.`,
                },
                venue_id: booking.venue_id,
                booking_id: bookingId,
              });
            } catch (commsErr) {
              console.error('Webhook payment failure alert send failed:', commsErr);
            }
          }
        }
      }
      console.error('payment_intent.payment_failed', pi.id, pi.last_payment_error?.message);
    } else if (event.type === 'account.updated') {
      const account = event.data.object as Stripe.Account;
      if (account.id) {
        const { data: venue } = await supabase
          .from('venues')
          .select('id')
          .eq('stripe_connected_account_id', account.id)
          .maybeSingle();
        if (venue) {
          // Log the status change. The StripeConnectSection UI fetches live
          // status from Stripe on each load, so no DB columns needed here.
          console.log(`[Stripe] account.updated for venue ${venue.id}: charges_enabled=${account.charges_enabled}, details_submitted=${account.details_submitted}`);
        }
      }
    } else if (event.type === 'charge.refunded' || event.type === 'charge.refund.updated') {
      let paymentIntentId: string | null = null;
      if (event.type === 'charge.refunded') {
        const charge = event.data.object as Stripe.Charge;
        paymentIntentId = typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id ?? null;
      } else {
        const refund = event.data.object as Stripe.Refund;
        const accountId = connectedAccountId;
        if (refund.charge) {
          const chargeId = typeof refund.charge === 'string' ? refund.charge : refund.charge.id;
          try {
            const charge = accountId
              ? await stripe.charges.retrieve(chargeId, { stripeAccount: accountId })
              : await stripe.charges.retrieve(chargeId);
            paymentIntentId = typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id ?? null;
          } catch (chargeErr) {
            console.error('[Stripe webhook] Failed to retrieve charge for refund:', chargeErr);
          }
        }
      }
      if (paymentIntentId) {
        const { data: booking } = await supabase
          .from('bookings')
          .select('id, deposit_status')
          .eq('stripe_payment_intent_id', paymentIntentId)
          .single();

        if (booking && booking.deposit_status !== 'Refunded') {
          await supabase
            .from('bookings')
            .update({
              deposit_status: 'Refunded',
              updated_at: new Date().toISOString(),
            })
            .eq('id', booking.id);
        }
      }
    }

    await recordProcessed(supabase, event.id, event.type);
    return NextResponse.json({ received: true });
  } catch (err) {
    console.error('Webhook processing failed:', event.id, event.type, err);
    return NextResponse.json({ error: 'Processing failed' }, { status: 500 });
  }
}

async function recordProcessed(
  supabase: ReturnType<typeof getSupabaseAdminClient>,
  stripeEventId: string,
  eventType: string
): Promise<void> {
  await supabase.from('webhook_events').insert({
    stripe_event_id: stripeEventId,
    event_type: eventType,
  });
}
