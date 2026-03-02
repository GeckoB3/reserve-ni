import { loadStripe, type Stripe } from '@stripe/stripe-js';

const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;

if (!publishableKey) {
  throw new Error('NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is not set');
}

const key: string = publishableKey;
let stripePromise: Promise<Stripe | null> | null = null;

/**
 * Client-side Stripe instance (loadStripe). Use this in browser code for
 * confirming payment intents, collecting payment method, or other client-side
 * Stripe.js flows. For Connect flows, the server creates the PaymentIntent
 * on the connected account and returns the client secret; the client confirms
 * using this Stripe instance as usual.
 */
export function getStripe(): Promise<Stripe | null> {
  if (!stripePromise) {
    stripePromise = loadStripe(key);
  }
  return stripePromise;
}
