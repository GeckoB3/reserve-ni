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

  const appointmentsProduct = await stripe.products.create({
    name: 'Reserve NI Appointments',
    description: 'Appointments plan - unlimited calendars, 300 SMS/month included. £29/month.',
  });

  const appointmentsPrice = await stripe.prices.create({
    product: appointmentsProduct.id,
    unit_amount: 2900,
    currency: 'gbp',
    recurring: { interval: 'month' },
  });

  console.log(`Appointments Product: ${appointmentsProduct.id}`);
  console.log(`Appointments Price:   ${appointmentsPrice.id}`);

  const restaurantProduct = await stripe.products.create({
    name: 'Reserve NI Restaurant',
    description: 'Restaurant plan - unlimited calendars, table management, 800 SMS/month included. £79/month.',
  });

  const restaurantPrice = await stripe.prices.create({
    product: restaurantProduct.id,
    unit_amount: 7900,
    currency: 'gbp',
    recurring: { interval: 'month' },
  });

  console.log(`Restaurant Product:  ${restaurantProduct.id}`);
  console.log(`Restaurant Price:    ${restaurantPrice.id}`);

  console.log('\n--- Add these to your .env.local ---\n');
  console.log(`STRIPE_APPOINTMENTS_PRICE_ID=${appointmentsPrice.id}`);
  console.log(`STRIPE_RESTAURANT_PRICE_ID=${restaurantPrice.id}`);
  console.log('\nAlso register a webhook endpoint at {your-domain}/api/webhooks/stripe-subscription');
  console.log('for events: checkout.session.completed, customer.subscription.updated,');
  console.log('customer.subscription.deleted, invoice.payment_succeeded, invoice.payment_failed');
  console.log('and set STRIPE_ONBOARDING_WEBHOOK_SECRET=whsec_xxx in .env.local\n');
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});
