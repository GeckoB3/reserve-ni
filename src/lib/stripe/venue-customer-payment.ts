import Stripe from 'stripe';
import { stripe } from '@/lib/stripe';
import { getSupabaseAdminClient } from '@/lib/supabase';
import { isLightPlanTier } from '@/lib/tier-enforcement';

/**
 * True when the venue's Stripe customer has a default payment method suitable for SMS billing.
 * Light plan requires a card on file before SMS sends; other tiers use existing behaviour.
 */
export async function venueHasStripePaymentMethodForSms(venueId: string): Promise<boolean> {
  const admin = getSupabaseAdminClient();
  const { data: row, error } = await admin
    .from('venues')
    .select('stripe_customer_id, pricing_tier')
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

  try {
    const customer = await stripe.customers.retrieve(customerId, {
      expand: ['invoice_settings.default_payment_method'],
    });
    const c = customer as Stripe.Customer;
    const def = c.invoice_settings?.default_payment_method;
    if (typeof def === 'string' && def.length > 0) return true;
    if (def && typeof def === 'object') return true;
    if (c.default_source) return true;
    return false;
  } catch (e) {
    console.warn('[venueHasStripePaymentMethodForSms] retrieve failed', { venueId, err: e });
    return false;
  }
}
