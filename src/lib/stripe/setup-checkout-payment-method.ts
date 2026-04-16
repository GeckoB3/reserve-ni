import type Stripe from 'stripe';
import { stripe } from '@/lib/stripe';

/**
 * Read the saved PaymentMethod from a completed Checkout Session in `setup` mode.
 */
export async function getPaymentMethodIdFromSetupCheckoutSession(
  sessionId: string,
): Promise<string | null> {
  const full = await stripe.checkout.sessions.retrieve(sessionId, {
    expand: ['setup_intent.payment_method'],
  });
  const st = full.setup_intent;
  if (!st || typeof st === 'string') {
    return null;
  }
  const si = st as Stripe.SetupIntent;
  const pmRaw = si.payment_method;
  if (typeof pmRaw === 'string' && pmRaw.length > 0) {
    return pmRaw;
  }
  if (pmRaw && typeof pmRaw === 'object' && 'id' in pmRaw) {
    return (pmRaw as Stripe.PaymentMethod).id;
  }
  return null;
}

/**
 * Attach a payment method as the customer default so subscriptions and invoices can charge.
 */
export async function setCustomerDefaultPaymentMethod(
  customerId: string,
  paymentMethodId: string,
): Promise<void> {
  await stripe.customers.update(customerId, {
    invoice_settings: { default_payment_method: paymentMethodId },
  });
}
