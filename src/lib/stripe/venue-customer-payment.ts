import Stripe from 'stripe';
import { stripe } from '@/lib/stripe';
import { getSupabaseAdminClient } from '@/lib/supabase';
import { isLightPlanTier } from '@/lib/tier-enforcement';

/**
 * True when the Stripe customer has a default card (or legacy default source) for invoices and subscriptions.
 */
export async function stripeCustomerHasDefaultPaymentMethod(customerId: string): Promise<boolean> {
  const id = customerId.trim();
  if (!id) return false;
  try {
    const customer = await stripe.customers.retrieve(id, {
      expand: ['invoice_settings.default_payment_method'],
    });
    if (customer.deleted) return false;
    const c = customer as Stripe.Customer;
    const def = c.invoice_settings?.default_payment_method;
    if (typeof def === 'string' && def.length > 0) return true;
    if (def && typeof def === 'object') return true;
    if (c.default_source) return true;
    return false;
  } catch (e) {
    console.warn('[stripeCustomerHasDefaultPaymentMethod] retrieve failed', { customerId: id, err: e });
    return false;
  }
}

function hasPaymentMethodValue(value: unknown): boolean {
  if (typeof value === 'string') return value.length > 0;
  return Boolean(value && typeof value === 'object');
}

/**
 * True when the active subscription or its customer has a payment method that Stripe can use for recurring invoices.
 * Checkout-created subscriptions often store the card on the subscription rather than the customer invoice defaults.
 */
export async function stripeSubscriptionOrCustomerHasPaymentMethod({
  customerId,
  subscriptionId,
}: {
  customerId?: string | null;
  subscriptionId?: string | null;
}): Promise<boolean> {
  const subId = subscriptionId?.trim();
  if (subId) {
    try {
      const subscription = await stripe.subscriptions.retrieve(subId, {
        expand: ['default_payment_method'],
      });
      if (hasPaymentMethodValue(subscription.default_payment_method)) return true;
      const customer =
        typeof subscription.customer === 'string' ? subscription.customer : subscription.customer?.id;
      if (customer) {
        return stripeCustomerHasDefaultPaymentMethod(customer);
      }
    } catch (e) {
      console.warn('[stripeSubscriptionOrCustomerHasPaymentMethod] subscription retrieve failed', {
        subscriptionId: subId,
        err: e,
      });
    }
  }

  const cid = customerId?.trim();
  return cid ? stripeCustomerHasDefaultPaymentMethod(cid) : false;
}

/**
 * True when the venue's Stripe customer has a default payment method suitable for SMS billing.
 * Light plan requires a card on file before SMS sends; other tiers use existing behaviour.
 */
export async function venueHasStripePaymentMethodForSms(venueId: string): Promise<boolean> {
  const admin = getSupabaseAdminClient();
  const { data: row, error } = await admin
    .from('venues')
    .select('stripe_customer_id, stripe_subscription_id, pricing_tier')
    .eq('id', venueId)
    .maybeSingle();

  if (error || !row) {
    return false;
  }

  const tier = (row as { pricing_tier?: string | null }).pricing_tier;
  const customerId = (row as { stripe_customer_id?: string | null }).stripe_customer_id?.trim();
  if (!isLightPlanTier(tier)) {
    return true;
  }
  if (!customerId) {
    return false;
  }

  const subscriptionId = (row as { stripe_subscription_id?: string | null }).stripe_subscription_id;
  return stripeSubscriptionOrCustomerHasPaymentMethod({ customerId, subscriptionId });
}
