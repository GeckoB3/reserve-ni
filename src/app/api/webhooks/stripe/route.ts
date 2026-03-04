import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { stripe } from '@/lib/stripe';
import { getSupabaseAdminClient } from '@/lib/supabase';
import { sendCommunication } from '@/lib/communications';
import { generateConfirmToken, hashConfirmToken } from '@/lib/confirm-token';

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
    if (!sig || !webhookSecret) {
      return NextResponse.json({ error: 'Missing signature or secret' }, { status: 400 });
    }
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Stripe webhook signature verification failed:', message);
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
        .select('id, venue_id, guest_id, status, deposit_status')
        .eq('id', bookingId)
        .single();

      if (!booking || booking.status === 'Confirmed') {
        await recordProcessed(supabase, event.id, event.type);
        return NextResponse.json({ received: true });
      }

      await supabase
        .from('bookings')
        .update({
          status: 'Confirmed',
          deposit_status: 'Paid',
          updated_at: new Date().toISOString(),
        })
        .eq('id', bookingId);

      const { data: bRow } = await supabase.from('bookings').select('confirm_token_hash, booking_date, booking_time, party_size, cancellation_deadline, deposit_amount_pence, dietary_notes, occasion').eq('id', bookingId).single();
      let manageToken: string | undefined;
      if (!bRow?.confirm_token_hash) {
        manageToken = generateConfirmToken();
        await supabase.from('bookings').update({
          confirm_token_hash: hashConfirmToken(manageToken),
          updated_at: new Date().toISOString(),
        }).eq('id', bookingId);
      }
      const { data: venue } = await supabase.from('venues').select('name').eq('id', booking.venue_id).single();
      const { data: guest } = await supabase.from('guests').select('name, email, phone').eq('id', booking.guest_id).single();
      const b = bRow;
      const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://reserveni.com';
      const manageBookingLink = manageToken ? `${baseUrl}/manage/${bookingId}/${encodeURIComponent(manageToken)}` : undefined;
      const depositAmount = b?.deposit_amount_pence != null ? (b.deposit_amount_pence / 100).toFixed(2) : undefined;
      await sendCommunication({
        type: 'booking_confirmation',
        recipient: { email: guest?.email ?? undefined, phone: guest?.phone ?? undefined },
        payload: {
          guest_name: guest?.name,
          venue_name: venue?.name,
          booking_date: b?.booking_date,
          booking_time: typeof b?.booking_time === 'string' ? b.booking_time.slice(0, 5) : b?.booking_time,
          party_size: b?.party_size,
          cancellation_deadline: b?.cancellation_deadline,
          deposit_amount: depositAmount,
          dietary_notes: b?.dietary_notes ?? undefined,
          occasion: b?.occasion ?? undefined,
          manage_booking_link: manageBookingLink,
        },
      });
    } else if (event.type === 'payment_intent.payment_failed') {
      const pi = event.data.object as Stripe.PaymentIntent;
      const bookingId = pi.metadata?.booking_id;
      if (bookingId) {
        await supabase
          .from('bookings')
          .update({ updated_at: new Date().toISOString() })
          .eq('id', bookingId);
      }
      console.error('payment_intent.payment_failed', pi.id, pi.last_payment_error?.message);
    } else if (event.type === 'charge.refunded' || event.type === 'charge.refund.updated') {
      let paymentIntentId: string | null = null;
      if (event.type === 'charge.refunded') {
        const charge = event.data.object as Stripe.Charge;
        paymentIntentId = typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id ?? null;
      } else {
        const refund = event.data.object as Stripe.Refund;
        const account = (event as Stripe.Event & { account?: string }).account;
        if (refund.charge) {
          const chargeId = typeof refund.charge === 'string' ? refund.charge : refund.charge.id;
          const charge = await stripe.charges.retrieve(chargeId, account ? { stripeAccount: account } : undefined);
          paymentIntentId = typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id ?? null;
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
