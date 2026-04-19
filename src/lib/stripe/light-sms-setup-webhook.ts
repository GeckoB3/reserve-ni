import type Stripe from 'stripe';
import type { SupabaseClient } from '@supabase/supabase-js';
import { stripe } from '@/lib/stripe';
import {
  getPaymentMethodIdFromSetupCheckoutSession,
  setCustomerDefaultPaymentMethod,
} from '@/lib/stripe/setup-checkout-payment-method';
import {
  getPersistedSubscriptionItemIds,
  getStripeLightPlanPriceId,
  getStripeSmsLightPriceId,
} from '@/lib/stripe/subscription-line-items';
import {
  subscriptionCancelAtPeriodEnd,
  subscriptionPeriodEndIso,
  subscriptionPeriodStartIso,
} from '@/lib/stripe/subscription-fields';
import { updateVenueSmsMonthlyAllowance } from '@/lib/billing/sms-allowance';

/**
 * After Setup Checkout completes for Appointments Light SMS opt-in, create the subscription:
 * £5/mo item deferred with trial_end = light_plan_free_period_ends_at (when in the future),
 * plus metered SMS (8p) on the same subscription.
 */
export async function handleLightSmsSetupCheckoutCompleted(
  supabase: SupabaseClient,
  session: Stripe.Checkout.Session,
): Promise<void> {
  const meta = session.metadata ?? {};
  const venueId = typeof meta.venue_id === 'string' ? meta.venue_id.trim() : '';
  if (!venueId) {
    console.warn('[Light SMS setup] Missing venue_id on setup session', session.id);
    return;
  }

  const customerId =
    typeof session.customer === 'string'
      ? session.customer
      : session.customer && typeof session.customer === 'object'
        ? (session.customer as Stripe.Customer).id
        : null;
  if (!customerId?.trim()) {
    console.error('[Light SMS setup] No customer on Checkout session', session.id);
    throw new Error('Light SMS setup: missing customer');
  }

  const { data: venue, error: venueErr } = await supabase
    .from('venues')
    .select(
      'id, pricing_tier, stripe_subscription_id, stripe_customer_id, light_plan_free_period_ends_at',
    )
    .eq('id', venueId)
    .maybeSingle();

  if (venueErr || !venue) {
    console.error('[Light SMS setup] Venue lookup failed', { venueId, venueErr });
    throw new Error('Light SMS setup: venue not found');
  }

  const tier = String((venue as { pricing_tier?: string }).pricing_tier ?? '').toLowerCase();
  if (tier !== 'light') {
    console.warn('[Light SMS setup] Venue is not Light tier; skipping subscription create', { venueId, tier });
    return;
  }

  if ((venue as { stripe_customer_id?: string | null }).stripe_customer_id !== customerId) {
    console.error('[Light SMS setup] Customer mismatch', { venueId, customerId });
    throw new Error('Light SMS setup: customer mismatch');
  }

  const existingSub = (venue as { stripe_subscription_id?: string | null }).stripe_subscription_id?.trim();
  if (existingSub) {
    console.log('[Light SMS setup] Venue already has subscription; idempotent skip', { venueId, existingSub });
    return;
  }

  const lightPrice = getStripeLightPlanPriceId();
  const smsLightPrice = getStripeSmsLightPriceId();
  if (!lightPrice?.trim()) {
    console.error('[Light SMS setup] STRIPE_LIGHT_PRICE_ID not set');
    throw new Error('Light SMS setup: STRIPE_LIGHT_PRICE_ID missing');
  }
  if (!smsLightPrice?.trim()) {
    console.error('[Light SMS setup] STRIPE_SMS_LIGHT_PRICE_ID not set');
    throw new Error('Light SMS setup: STRIPE_SMS_LIGHT_PRICE_ID missing');
  }

  const endRaw = (venue as { light_plan_free_period_ends_at?: string | null }).light_plan_free_period_ends_at;
  const freeEnd = endRaw ? new Date(endRaw) : null;
  const nowSec = Math.floor(Date.now() / 1000);
  let trialEnd: number | undefined;
  if (freeEnd && !Number.isNaN(freeEnd.getTime())) {
    const t = Math.floor(freeEnd.getTime() / 1000);
    if (t > nowSec + 60) {
      trialEnd = t;
    }
  }

  const paymentMethodId = await getPaymentMethodIdFromSetupCheckoutSession(session.id);
  if (paymentMethodId) {
    await setCustomerDefaultPaymentMethod(customerId, paymentMethodId);
  } else {
    console.warn('[Light SMS setup] No payment method on setup session; subscription creation may fail or remain incomplete', {
      venueId,
      sessionId: session.id,
    });
  }

  const items: Stripe.SubscriptionCreateParams.Item[] = [
    { price: lightPrice.trim() },
    { price: smsLightPrice.trim() },
  ];

  const sub = await stripe.subscriptions.create({
    customer: customerId,
    items,
    ...(trialEnd ? { trial_end: trialEnd } : {}),
    ...(paymentMethodId ? { default_payment_method: paymentMethodId } : {}),
    metadata: { venue_id: venueId, source: 'light_sms_setup' },
  });

  const ids = getPersistedSubscriptionItemIds(sub);
  const periodEndIso = subscriptionPeriodEndIso(sub);
  const periodStartIso = subscriptionPeriodStartIso(sub);
  const cancelAtPeriodEnd = subscriptionCancelAtPeriodEnd(sub);

  await supabase
    .from('venues')
    .update({
      stripe_subscription_id: sub.id,
      stripe_subscription_item_id: ids.mainSubscriptionItemId,
      stripe_sms_subscription_item_id: ids.smsSubscriptionItemId,
      subscription_current_period_start: periodStartIso,
      subscription_current_period_end: periodEndIso,
      plan_status: cancelAtPeriodEnd ? 'cancelling' : sub.status === 'trialing' ? 'trialing' : 'active',
    })
    .eq('id', venueId);

  await updateVenueSmsMonthlyAllowance(venueId);
  console.log('[Light SMS setup] Created Light subscription after Setup Checkout', { venueId, subscriptionId: sub.id });
}
