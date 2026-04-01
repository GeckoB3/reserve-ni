import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdminClient } from '@/lib/supabase';
import { stripe } from '@/lib/stripe';
import {
  subscriptionCancelAtPeriodEnd,
  subscriptionPeriodEndIso,
  subscriptionStatus,
} from '@/lib/stripe/subscription-fields';
import {
  buildCheckoutLineItems,
  buildSubscriptionItemsForPlanChange,
  findMainPlanSubscriptionItem,
  getPersistedSubscriptionItemIds,
} from '@/lib/stripe/subscription-line-items';
import { isUnifiedSchedulingVenue } from '@/lib/booking/unified-scheduling';
import { updateVenueSmsMonthlyAllowance } from '@/lib/billing/sms-allowance';

async function countActiveCalendars(
  admin: ReturnType<typeof getSupabaseAdminClient>,
  venueId: string,
  bookingModel: string | null | undefined,
): Promise<number> {
  const table = bookingModel === 'unified_scheduling' ? 'unified_calendars' : 'practitioners';
  const { count } = await admin
    .from(table)
    .select('id', { count: 'exact', head: true })
    .eq('venue_id', venueId)
    .eq('is_active', true);
  return count ?? 0;
}

/**
 * POST /api/venue/change-plan
 * Handle plan changes: upgrade (standard->business), downgrade (business->standard), cancel.
 * Body: { action: 'upgrade' | 'downgrade' | 'cancel' | 'resubscribe' | 'resume_subscription', calendar_count?: number }
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const admin = getSupabaseAdminClient();
    const { data: staffRows } = await admin
      .from('staff')
      .select('venue_id, role')
      .ilike('email', (user.email ?? '').toLowerCase().trim())
      .limit(1);
    const staffRow = staffRows?.[0] ?? null;

    if (!staffRow?.venue_id || staffRow.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { data: venue } = await admin
      .from('venues')
      .select('id, pricing_tier, stripe_customer_id, stripe_subscription_id, calendar_count, booking_model')
      .eq('id', staffRow.venue_id)
      .single();

    if (!venue) return NextResponse.json({ error: 'Venue not found' }, { status: 404 });

    const body = await request.json();
    const { action, calendar_count } = body as {
      action: 'upgrade' | 'downgrade' | 'cancel' | 'resubscribe' | 'resume_subscription';
      calendar_count?: number;
    };

    const origin = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';

    const requireStripeCustomer = () => {
      const cid = venue.stripe_customer_id as string | null;
      if (!cid?.trim()) {
        return NextResponse.json(
          { error: 'No billing customer on file. Contact support or complete signup billing first.' },
          { status: 400 },
        );
      }
      return null;
    };

    switch (action) {
      case 'upgrade': {
        const custErr = requireStripeCustomer();
        if (custErr) return custErr;
        const businessPriceId = process.env.STRIPE_BUSINESS_PRICE_ID;
        if (!businessPriceId) {
          return NextResponse.json({ error: 'Business price not configured' }, { status: 500 });
        }

        const tier = (venue.pricing_tier as string) ?? 'standard';
        const subId = venue.stripe_subscription_id as string | null;

        /**
         * Prefer updating the existing Stripe subscription in place with proration.
         * That applies credits for unused time on the old price and only charges the net difference,
         * instead of starting a second subscription and cancelling the first (which can double-charge).
         */
        if (subId && tier === 'standard') {
          try {
            const existing = await stripe.subscriptions.retrieve(subId);
            if (existing.status === 'active' || existing.status === 'trialing') {
              const mainItem = findMainPlanSubscriptionItem(existing);
              if (!mainItem?.id) {
                throw new Error('No subscription line item');
              }
              const updated = await stripe.subscriptions.update(subId, {
                items: buildSubscriptionItemsForPlanChange(existing, {
                  id: mainItem.id,
                  price: businessPriceId,
                  quantity: 1,
                }),
                proration_behavior: 'create_prorations',
                cancel_at_period_end: false,
              });
              const periodEndIso = subscriptionPeriodEndIso(updated);
              const cancelling = subscriptionCancelAtPeriodEnd(updated);
              const itemIds = getPersistedSubscriptionItemIds(updated);
              await admin
                .from('venues')
                .update({
                  pricing_tier: 'business',
                  calendar_count: null,
                  stripe_subscription_item_id: itemIds.mainSubscriptionItemId,
                  stripe_sms_subscription_item_id: itemIds.smsSubscriptionItemId,
                  subscription_current_period_end: periodEndIso,
                  plan_status: cancelling ? 'cancelling' : 'active',
                })
                .eq('id', venue.id);
              await updateVenueSmsMonthlyAllowance(venue.id);
              return NextResponse.json({
                ok: true,
                message:
                  'Plan updated. Stripe applies proration: you get credit for unused Standard time and are charged for Business for the rest of this billing period.',
              });
            }
            if (existing.status === 'past_due') {
              return NextResponse.json(
                {
                  error:
                    'Your last payment did not succeed. Update your payment method with Stripe (check your email for a link) or contact support before upgrading.',
                },
                { status: 400 },
              );
            }
          } catch (e) {
            console.error('[change-plan] upgrade subscription.update failed, falling back to Checkout:', e);
          }
        }

        // No active subscription on file (e.g. first paid upgrade from a non-Stripe state) or update failed: Checkout
        const session = await stripe.checkout.sessions.create({
          customer: venue.stripe_customer_id as string,
          mode: 'subscription',
          line_items: buildCheckoutLineItems(businessPriceId, 1),
          metadata: {
            venue_id: venue.id,
            plan: 'business',
            action: 'upgrade',
            old_subscription_id: venue.stripe_subscription_id ?? '',
          },
          success_url: `${origin}/dashboard/settings?tab=plan&upgraded=true`,
          cancel_url: `${origin}/dashboard/settings?tab=plan`,
        });

        return NextResponse.json({ redirect_url: session.url });
      }

      case 'downgrade': {
        if ((venue.booking_model as string) === 'table_reservation') {
          return NextResponse.json(
            { error: 'Restaurant venues must stay on the Business plan. Contact support if you need help.' },
            { status: 400 },
          );
        }
        const custErr = requireStripeCustomer();
        if (custErr) return custErr;
        const standardPriceId = process.env.STRIPE_STANDARD_PRICE_ID;
        if (!standardPriceId) {
          return NextResponse.json({ error: 'Standard price not configured' }, { status: 500 });
        }

        let minQty = 1;
        if (isUnifiedSchedulingVenue(venue.booking_model)) {
          const n = await countActiveCalendars(admin, staffRow.venue_id, venue.booking_model as string);
          minQty = Math.max(1, n);
        }
        const qty = Math.max(minQty, calendar_count ?? minQty);

        const tier = (venue.pricing_tier as string) ?? 'standard';
        const subId = venue.stripe_subscription_id as string | null;

        if (subId && tier === 'business') {
          try {
            const existing = await stripe.subscriptions.retrieve(subId);
            if (existing.status === 'active' || existing.status === 'trialing') {
              const mainItem = findMainPlanSubscriptionItem(existing);
              if (!mainItem?.id) {
                throw new Error('No subscription line item');
              }
              const updated = await stripe.subscriptions.update(subId, {
                items: buildSubscriptionItemsForPlanChange(existing, {
                  id: mainItem.id,
                  price: standardPriceId,
                  quantity: qty,
                }),
                proration_behavior: 'create_prorations',
                cancel_at_period_end: false,
              });
              const periodEndIso = subscriptionPeriodEndIso(updated);
              const cancelling = subscriptionCancelAtPeriodEnd(updated);
              const itemIds = getPersistedSubscriptionItemIds(updated);
              await admin
                .from('venues')
                .update({
                  pricing_tier: 'standard',
                  calendar_count: qty,
                  stripe_subscription_item_id: itemIds.mainSubscriptionItemId,
                  stripe_sms_subscription_item_id: itemIds.smsSubscriptionItemId,
                  subscription_current_period_end: periodEndIso,
                  plan_status: cancelling ? 'cancelling' : 'active',
                })
                .eq('id', venue.id);
              await updateVenueSmsMonthlyAllowance(venue.id);
              return NextResponse.json({
                ok: true,
                message:
                  'Plan updated. Stripe applies proration for the rest of this billing period based on your new Standard seats.',
              });
            }
            if (existing.status === 'past_due') {
              return NextResponse.json(
                {
                  error:
                    'Your last payment did not succeed. Resolve billing before switching plans.',
                },
                { status: 400 },
              );
            }
          } catch (e) {
            console.error('[change-plan] downgrade subscription.update failed, falling back to Checkout:', e);
          }
        }

        const session = await stripe.checkout.sessions.create({
          customer: venue.stripe_customer_id as string,
          mode: 'subscription',
          line_items: buildCheckoutLineItems(standardPriceId, qty),
          metadata: {
            venue_id: venue.id,
            plan: 'standard',
            action: 'downgrade',
            calendar_count: String(qty),
            old_subscription_id: venue.stripe_subscription_id ?? '',
          },
          success_url: `${origin}/dashboard/settings?tab=plan&downgraded=true`,
          cancel_url: `${origin}/dashboard/settings?tab=plan`,
        });

        return NextResponse.json({ redirect_url: session.url });
      }

      case 'cancel': {
        if (!venue.stripe_subscription_id) {
          return NextResponse.json({ error: 'No active subscription' }, { status: 400 });
        }
        const sub = await stripe.subscriptions.update(venue.stripe_subscription_id as string, {
          cancel_at_period_end: true,
        });
        const periodEndIso = subscriptionPeriodEndIso(sub);
        await admin
          .from('venues')
          .update({
            plan_status: 'cancelling',
            subscription_current_period_end: periodEndIso,
          })
          .eq('id', venue.id);
        return NextResponse.json({ ok: true, message: 'Subscription will cancel at end of billing period' });
      }

      case 'resume_subscription': {
        if (!venue.stripe_subscription_id) {
          return NextResponse.json({ error: 'No subscription to resume' }, { status: 400 });
        }
        const sub = await stripe.subscriptions.update(venue.stripe_subscription_id as string, {
          cancel_at_period_end: false,
        });
        const periodEndIso = subscriptionPeriodEndIso(sub);
        const st = subscriptionStatus(sub);
        await admin
          .from('venues')
          .update({
            plan_status: st === 'trialing' ? 'trialing' : 'active',
            subscription_current_period_end: periodEndIso,
          })
          .eq('id', venue.id);
        return NextResponse.json({ ok: true, message: 'Subscription will continue' });
      }

      case 'resubscribe': {
        const custErr = requireStripeCustomer();
        if (custErr) return custErr;
        // Re-create a checkout session for the current tier
        const isStandard = (venue.pricing_tier as string) === 'standard';
        const priceId = isStandard ? process.env.STRIPE_STANDARD_PRICE_ID : process.env.STRIPE_BUSINESS_PRICE_ID;

        if (!priceId) {
          return NextResponse.json({ error: 'Price not configured' }, { status: 500 });
        }

        let resubQty = 1;
        if (isStandard) {
          resubQty = Math.max(1, (venue.calendar_count as number | null) ?? 1);
          if (isUnifiedSchedulingVenue(venue.booking_model)) {
            const n = await countActiveCalendars(admin, staffRow.venue_id, venue.booking_model as string);
            resubQty = Math.max(resubQty, n, 1);
          }
        }

        const session = await stripe.checkout.sessions.create({
          customer: venue.stripe_customer_id as string,
          mode: 'subscription',
          line_items: buildCheckoutLineItems(priceId, resubQty),
          metadata: {
            venue_id: venue.id,
            plan: venue.pricing_tier as string,
            action: 'resubscribe',
            ...(isStandard ? { calendar_count: String(resubQty) } : {}),
          },
          success_url: `${origin}/dashboard/settings?tab=plan&resubscribed=true`,
          cancel_url: `${origin}/dashboard/settings?tab=plan`,
        });

        return NextResponse.json({ redirect_url: session.url });
      }

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (err) {
    console.error('[change-plan] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
