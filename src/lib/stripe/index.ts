import Stripe from 'stripe';

const secretKey = process.env.STRIPE_SECRET_KEY;

if (!secretKey) {
  throw new Error('STRIPE_SECRET_KEY is not set');
}

/**
 * Server-side Stripe client. Use this in API routes, server actions, and webhooks only.
 * Never import this file into client components or expose the secret key.
 *
 * Stripe Connect (direct charges): When creating payment intents, refunds, or other
 * operations on behalf of a connected restaurant account, pass the venue's
 * stripe_connected_account_id via the second argument:
 *
 *   stripe.paymentIntents.create({ ... }, { stripeAccount: venue.stripe_connected_account_id })
 *   stripe.refunds.create({ ... }, { stripeAccount: venue.stripe_connected_account_id })
 *
 * Restaurants onboard via Stripe's hosted Connect onboarding; store the returned
 * account ID (e.g. acct_xxx) on the venue record.
 */
export const stripe = new Stripe(secretKey, {
  typescript: true,
});
