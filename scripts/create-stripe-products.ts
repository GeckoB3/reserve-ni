/**
 * One-time script to create Stripe Products and Prices for ReserveNI billing.
 * Run with: npx tsx scripts/create-stripe-products.ts
 *
 * Prerequisites: STRIPE_SECRET_KEY must be set in the environment (or .env.local).
 * This uses Stripe Test Mode - safe to run repeatedly (creates new products each time).
 *
 * After running, copy the printed Price IDs into your .env.local file.
 */

import { config } from 'dotenv';
import { resolve } from 'path';
import Stripe from 'stripe';

config({ path: resolve(__dirname, '..', '.env.local') });

const secretKey = process.env.STRIPE_SECRET_KEY;
if (!secretKey) {
  console.error('STRIPE_SECRET_KEY is not set. Add it to .env.local or your environment.');
  process.exit(1);
}

const stripe = new Stripe(secretKey, { typescript: true });

async function main() {
  console.log('Creating Stripe Products and Prices for ReserveNI...\n');

  // Standard tier: £10/month per calendar (metered via quantity)
  const standardProduct = await stripe.products.create({
    name: 'Reserve NI Standard',
    description: 'Per-calendar booking management - £10/month per bookable calendar. All booking features, email communications.',
  });

  const standardPrice = await stripe.prices.create({
    product: standardProduct.id,
    unit_amount: 1000, // £10.00 in pence
    currency: 'gbp',
    recurring: { interval: 'month', usage_type: 'licensed' },
  });

  console.log(`Standard Product: ${standardProduct.id}`);
  console.log(`Standard Price:   ${standardPrice.id}`);

  // Business tier: £79/month flat
  const businessProduct = await stripe.products.create({
    name: 'Reserve NI Business',
    description: 'Unlimited calendars, SMS communications, table management, priority support - £79/month.',
  });

  const businessPrice = await stripe.prices.create({
    product: businessProduct.id,
    unit_amount: 7900, // £79.00 in pence
    currency: 'gbp',
    recurring: { interval: 'month' },
  });

  console.log(`Business Product:  ${businessProduct.id}`);
  console.log(`Business Price:    ${businessPrice.id}`);

  console.log('\n--- Add these to your .env.local ---\n');
  console.log(`STRIPE_STANDARD_PRICE_ID=${standardPrice.id}`);
  console.log(`STRIPE_BUSINESS_PRICE_ID=${businessPrice.id}`);
  console.log('\nAlso register a webhook endpoint at {your-domain}/api/webhooks/stripe-subscription');
  console.log('for events: checkout.session.completed, customer.subscription.updated,');
  console.log('customer.subscription.deleted, invoice.payment_succeeded, invoice.payment_failed');
  console.log('and set STRIPE_ONBOARDING_WEBHOOK_SECRET=whsec_xxx in .env.local\n');
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});
