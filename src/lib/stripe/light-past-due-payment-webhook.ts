import type { SupabaseClient } from '@supabase/supabase-js';
import type Stripe from 'stripe';
import { stripe } from '@/lib/stripe';
import {
  getPaymentMethodIdFromSetupCheckoutSession,
  setCustomerDefaultPaymentMethod,
} from '@/lib/stripe/setup-checkout-payment-method';

/**
 * Appointments Light: existing subscription failed; customer completed Setup Checkout to add/replace a card.
 * Attach PM to customer + subscription and attempt to pay open invoices (status clears via invoice webhooks).
 */
export async function handleLightPaymentMethodUpdateFromSetup(
  supabase: SupabaseClient,
  session: Stripe.Checkout.Session,
): Promise<void> {
  const meta = session.metadata ?? {};
  const venueId = typeof meta.venue_id === 'string' ? meta.venue_id.trim() : '';
  if (!venueId) {
    console.warn('[Light PM update] Missing venue_id', session.id);
    return;
  }

  const customerId =
    typeof session.customer === 'string'
      ? session.customer
      : session.customer && typeof session.customer === 'object'
        ? (session.customer as Stripe.Customer).id
        : null;
  if (!customerId?.trim()) {
    throw new Error('Light PM update: missing customer');
  }

  const paymentMethodId = await getPaymentMethodIdFromSetupCheckoutSession(session.id);
  if (!paymentMethodId) {
    throw new Error('Light PM update: no payment method on session');
  }

  await setCustomerDefaultPaymentMethod(customerId, paymentMethodId);

  const { data: venue, error } = await supabase
    .from('venues')
    .select('id, pricing_tier, stripe_subscription_id')
    .eq('id', venueId)
    .maybeSingle();

  if (error || !venue) {
    throw new Error('Light PM update: venue not found');
  }

  const tier = String((venue as { pricing_tier?: string }).pricing_tier ?? '').toLowerCase();
  if (tier !== 'light') {
    console.warn('[Light PM update] Not a Light venue; skipping subscription attach', { venueId });
    return;
  }

  const subId = (venue as { stripe_subscription_id?: string | null }).stripe_subscription_id?.trim();
  if (subId) {
    await stripe.subscriptions.update(subId, { default_payment_method: paymentMethodId });

    const open = await stripe.invoices.list({
      customer: customerId,
      subscription: subId,
      status: 'open',
      limit: 10,
    });

    for (const inv of open.data) {
      try {
        await stripe.invoices.pay(inv.id, { payment_method: paymentMethodId });
      } catch (e) {
        console.warn('[Light PM update] Could not pay invoice', { invoiceId: inv.id, venueId, err: e });
      }
    }
  }

  console.log('[Light PM update] Applied payment method from Setup Checkout', { venueId, customerId });
}
