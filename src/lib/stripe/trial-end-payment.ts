import type Stripe from 'stripe';
import { stripe } from '@/lib/stripe';

/** Pause failed trial-end charges within this window after `trial_end`. */
export const TRIAL_END_PAYMENT_FAILURE_WINDOW_SECONDS = 7 * 24 * 3600;

export function shouldPauseSubscriptionOnTrialEndPaymentFailure(
  sub: Pick<Stripe.Subscription, 'trial_end' | 'status'>,
  invoice: Pick<Stripe.Invoice, 'billing_reason' | 'amount_due'>,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): boolean {
  if (sub.status === 'paused') return false;
  if (sub.status !== 'past_due' && sub.status !== 'unpaid') return false;

  const trialEnd = sub.trial_end;
  if (!trialEnd || trialEnd > nowSeconds) return false;

  const elapsed = nowSeconds - trialEnd;
  if (elapsed > TRIAL_END_PAYMENT_FAILURE_WINDOW_SECONDS) return false;
  if (invoice.amount_due === 0) return false;

  if (
    invoice.billing_reason !== 'subscription_cycle' &&
    invoice.billing_reason !== 'subscription_create'
  ) {
    return false;
  }

  return true;
}

/** Resolves subscription id from a Stripe Invoice (SDK v17+ uses parent.subscription_details). */
export function getStripeInvoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const parentSub = invoice.parent?.subscription_details?.subscription;
  if (typeof parentSub === 'string') return parentSub;
  if (parentSub && typeof parentSub === 'object' && 'id' in parentSub) {
    return parentSub.id;
  }
  const legacy = (invoice as Stripe.Invoice & { subscription?: string | Stripe.Subscription | null }).subscription;
  if (typeof legacy === 'string') return legacy;
  if (legacy && typeof legacy === 'object' && 'id' in legacy) return legacy.id;
  return null;
}

/**
 * When the first post-trial invoice fails, pause collection so the subscription stops retrying
 * until the customer updates their payment method.
 */
export async function pauseSubscriptionOnTrialEndPaymentFailure(
  invoice: Stripe.Invoice,
): Promise<boolean> {
  const subId = getStripeInvoiceSubscriptionId(invoice);
  if (!subId) return false;

  const sub = await stripe.subscriptions.retrieve(subId);
  if (!shouldPauseSubscriptionOnTrialEndPaymentFailure(sub, invoice)) {
    return false;
  }

  await stripe.subscriptions.update(subId, {
    pause_collection: { behavior: 'void' },
  });
  return true;
}
