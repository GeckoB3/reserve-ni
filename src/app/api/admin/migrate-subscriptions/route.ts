import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase';
import { stripe } from '@/lib/stripe';
import { requireCronAuthorisation } from '@/lib/cron-auth';
import {
  findMainPlanSubscriptionItem,
  buildSubscriptionItemsForPlanChange,
} from '@/lib/stripe/subscription-line-items';

/**
 * POST /api/admin/migrate-subscriptions
 * Batch-migrate existing Stripe subscriptions from old prices to new prices.
 * Protected by CRON_SECRET (same auth as cron jobs).
 *
 * Standard subs → Appointments price (quantity 1)
 * Business subs → Restaurant price (quantity 1)
 */
export async function POST(request: NextRequest) {
  const denied = requireCronAuthorisation(request);
  if (denied) return denied;

  const appointmentsPriceId = process.env.STRIPE_APPOINTMENTS_PRICE_ID?.trim();
  const restaurantPriceId = process.env.STRIPE_RESTAURANT_PRICE_ID?.trim();
  const oldStandardPriceId = process.env.STRIPE_STANDARD_PRICE_ID?.trim();
  const oldBusinessPriceId = process.env.STRIPE_BUSINESS_PRICE_ID?.trim();

  if (!appointmentsPriceId || !restaurantPriceId) {
    return NextResponse.json(
      { error: 'STRIPE_APPOINTMENTS_PRICE_ID and STRIPE_RESTAURANT_PRICE_ID must be set' },
      { status: 500 },
    );
  }

  const admin = getSupabaseAdminClient();
  const results = {
    appointments_migrated: 0,
    restaurant_migrated: 0,
    skipped: 0,
    errors: [] as string[],
  };

  // Migrate appointments-tier venues (formerly standard)
  const { data: appointmentVenues } = await admin
    .from('venues')
    .select('id, name, stripe_subscription_id')
    .eq('pricing_tier', 'appointments')
    .not('stripe_subscription_id', 'is', null);

  for (const v of appointmentVenues ?? []) {
    const venue = v as { id: string; name: string; stripe_subscription_id: string };
    try {
      const sub = await stripe.subscriptions.retrieve(venue.stripe_subscription_id, {
        expand: ['items.data.price'],
      });
      const mainItem = findMainPlanSubscriptionItem(sub);
      if (!mainItem) {
        results.errors.push(`${venue.name}: no main plan item found`);
        continue;
      }
      const currentPriceId = typeof mainItem.price === 'string' ? mainItem.price : mainItem.price?.id;
      if (currentPriceId === appointmentsPriceId) {
        results.skipped++;
        continue;
      }
      if (oldStandardPriceId && currentPriceId !== oldStandardPriceId) {
        results.errors.push(`${venue.name}: unexpected price ${currentPriceId}, skipping`);
        continue;
      }
      const items = buildSubscriptionItemsForPlanChange(sub, {
        id: mainItem.id,
        price: appointmentsPriceId,
        quantity: 1,
      });
      await stripe.subscriptions.update(venue.stripe_subscription_id, {
        items,
        proration_behavior: 'none',
      });
      results.appointments_migrated++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      results.errors.push(`${venue.name}: ${msg}`);
    }
  }

  // Migrate restaurant-tier venues (formerly business)
  const { data: restaurantVenues } = await admin
    .from('venues')
    .select('id, name, stripe_subscription_id')
    .eq('pricing_tier', 'restaurant')
    .not('stripe_subscription_id', 'is', null);

  for (const v of restaurantVenues ?? []) {
    const venue = v as { id: string; name: string; stripe_subscription_id: string };
    try {
      const sub = await stripe.subscriptions.retrieve(venue.stripe_subscription_id, {
        expand: ['items.data.price'],
      });
      const mainItem = findMainPlanSubscriptionItem(sub);
      if (!mainItem) {
        results.errors.push(`${venue.name}: no main plan item found`);
        continue;
      }
      const currentPriceId = typeof mainItem.price === 'string' ? mainItem.price : mainItem.price?.id;
      if (currentPriceId === restaurantPriceId) {
        results.skipped++;
        continue;
      }
      if (oldBusinessPriceId && currentPriceId !== oldBusinessPriceId) {
        results.errors.push(`${venue.name}: unexpected price ${currentPriceId}, skipping`);
        continue;
      }
      const items = buildSubscriptionItemsForPlanChange(sub, {
        id: mainItem.id,
        price: restaurantPriceId,
        quantity: 1,
      });
      await stripe.subscriptions.update(venue.stripe_subscription_id, {
        items,
        proration_behavior: 'none',
      });
      results.restaurant_migrated++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      results.errors.push(`${venue.name}: ${msg}`);
    }
  }

  console.log('[migrate-subscriptions] Results:', JSON.stringify(results));
  return NextResponse.json({ ok: true, ...results });
}
