import { NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { createClient } from '@/lib/supabase/server';
import { getVenueStaff, requireAdmin } from '@/lib/venue-auth';
import { stripe } from '@/lib/stripe';
import {
  findMainPlanSubscriptionItem,
  findSmsMeteredSubscriptionItem,
  getPersistedSubscriptionItemIds,
  getStripeAppointmentsPlusPriceId,
  getStripeAppointmentsProPriceId,
  getStripeLightPlanPriceId,
  getStripeSmsLightPriceId,
  getStripeSmsOveragePriceId,
} from '@/lib/stripe/subscription-line-items';
import {
  mapStripeSubscriptionToPlanStatus,
  subscriptionPeriodEndIso,
  subscriptionPeriodStartIso,
} from '@/lib/stripe/subscription-fields';
import { countUnifiedCalendarColumns } from '@/lib/light-plan';
import { planCalendarLimit, planStaffLimit } from '@/lib/plan-limits';
import { isUnifiedSchedulingVenue } from '@/lib/booking/unified-scheduling';
import { isAppointmentPlanTier } from '@/lib/tier-enforcement';
import { planDisplayName } from '@/lib/pricing-constants';
import { updateVenueSmsMonthlyAllowance } from '@/lib/billing/sms-allowance';

type AppointmentsTier = 'light' | 'plus' | 'appointments';

const APPOINTMENTS_TIERS = new Set<AppointmentsTier>(['light', 'plus', 'appointments']);

function parseTargetTier(value: unknown): AppointmentsTier | null {
  if (typeof value !== 'string') return null;
  const tier = value.toLowerCase().trim();
  return APPOINTMENTS_TIERS.has(tier as AppointmentsTier) ? (tier as AppointmentsTier) : null;
}

function mainPriceForTier(targetTier: AppointmentsTier): string {
  const priceId =
    targetTier === 'light'
      ? getStripeLightPlanPriceId()
      : targetTier === 'plus'
      ? getStripeAppointmentsPlusPriceId()
      : getStripeAppointmentsProPriceId();
  if (!priceId?.trim()) {
    throw new Error(
      targetTier === 'light'
        ? 'STRIPE_LIGHT_PRICE_ID is not configured'
        : targetTier === 'plus'
        ? 'STRIPE_APPOINTMENTS_PLUS_PRICE_ID is not configured'
        : 'STRIPE_APPOINTMENTS_PRO_PRICE_ID is not configured',
    );
  }
  return priceId.trim();
}

function smsPriceForTier(targetTier: AppointmentsTier): string | null {
  const priceId = targetTier === 'light' ? getStripeSmsLightPriceId() : getStripeSmsOveragePriceId();
  return priceId?.trim() || null;
}

function planOrder(tier: AppointmentsTier): number {
  if (tier === 'light') return 0;
  if (tier === 'plus') return 1;
  return 2;
}

function subscriptionItemsForTier(
  subscription: Stripe.Subscription,
  targetTier: AppointmentsTier,
): Stripe.SubscriptionUpdateParams.Item[] {
  const mainItem = findMainPlanSubscriptionItem(subscription);
  if (!mainItem?.id) {
    throw new Error('Could not find current subscription plan item.');
  }

  const items: Stripe.SubscriptionUpdateParams.Item[] = [
    { id: mainItem.id, price: mainPriceForTier(targetTier), quantity: 1 },
  ];
  const smsItem = findSmsMeteredSubscriptionItem(subscription);
  const targetSmsPrice = smsPriceForTier(targetTier);
  if (targetSmsPrice && smsItem?.id) {
    items.push({ id: smsItem.id, price: targetSmsPrice });
  } else if (targetSmsPrice) {
    items.push({ price: targetSmsPrice });
  } else if (smsItem?.id) {
    items.push({ id: smsItem.id, deleted: true });
  }
  return items;
}

/**
 * POST /api/venue/appointments-plan/change
 * Updates the existing subscription to move between Appointments Light, Plus, and Pro.
 * Upgrades invoice prorations immediately; downgrades create prorated credits for the next invoice.
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const staff = await getVenueStaff(supabase);
    if (!staff || !requireAdmin(staff)) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const body = (await request.json()) as { target_tier?: unknown };
    const targetTier = parseTargetTier(body.target_tier);
    if (!targetTier) {
      return NextResponse.json({ error: 'Choose Appointments Light, Plus, or Pro.' }, { status: 400 });
    }

    const admin = staff.db;
    const { data: venue, error } = await admin
      .from('venues')
      .select('id, pricing_tier, booking_model, plan_status, stripe_customer_id, stripe_subscription_id')
      .eq('id', staff.venue_id)
      .maybeSingle();

    if (error || !venue) {
      return NextResponse.json({ error: 'Venue not found' }, { status: 404 });
    }

    const currentTier = String((venue as { pricing_tier?: string | null }).pricing_tier ?? '').toLowerCase().trim();
    if (!isAppointmentPlanTier(currentTier)) {
      return NextResponse.json({ error: 'Plan changes here are only available for Appointments plans.' }, { status: 400 });
    }
    if (currentTier === targetTier) {
      return NextResponse.json({ error: `You are already on ${planDisplayName(targetTier)}.` }, { status: 400 });
    }

    const bookingModel = (venue as { booking_model?: string | null }).booking_model ?? '';
    if (!isUnifiedSchedulingVenue(bookingModel)) {
      return NextResponse.json({ error: 'Appointments plan changes require a unified scheduling venue.' }, { status: 400 });
    }

    const planStatus = String((venue as { plan_status?: string | null }).plan_status ?? '').toLowerCase().trim();
    if (planStatus === 'past_due') {
      return NextResponse.json(
        { error: 'Update your payment method and clear the overdue invoice before changing plan.' },
        { status: 400 },
      );
    }
    if (planStatus === 'cancelling') {
      return NextResponse.json(
        { error: 'Resume your current subscription before changing plan.' },
        { status: 400 },
      );
    }
    if (planStatus === 'cancelled') {
      return NextResponse.json(
        { error: 'Resubscribe to your current plan before changing to another Appointments plan.' },
        { status: 400 },
      );
    }

    const targetCalendarLimit = planCalendarLimit(targetTier);
    if (targetCalendarLimit !== Infinity) {
      const calendarCount = await countUnifiedCalendarColumns(admin, staff.venue_id);
      if (calendarCount > targetCalendarLimit) {
        return NextResponse.json(
          {
            error:
              targetTier === 'light'
                ? 'Deactivate extra calendars so only one bookable calendar remains before downgrading to Light.'
                : 'Appointments Plus includes up to 5 bookable calendars. Deactivate extra calendars before downgrading.',
          },
          { status: 400 },
        );
      }
    }

    const targetStaffLimit = planStaffLimit(targetTier);
    if (targetStaffLimit !== Infinity) {
      const { count, error: staffCountErr } = await admin
        .from('staff')
        .select('id', { count: 'exact', head: true })
        .eq('venue_id', staff.venue_id);
      if (staffCountErr) {
        console.error('[appointments-plan/change] staff count failed:', staffCountErr.message);
        return NextResponse.json({ error: 'Could not verify team size.' }, { status: 500 });
      }
      if ((count ?? 0) > targetStaffLimit) {
        return NextResponse.json(
          {
            error:
              targetTier === 'light'
                ? 'Remove extra team members so only one login remains before downgrading to Light.'
                : 'Appointments Plus includes up to 5 team logins. Remove extra team members before downgrading.',
          },
          { status: 400 },
        );
      }
    }

    const subscriptionId = (venue as { stripe_subscription_id?: string | null }).stripe_subscription_id?.trim();
    if (!subscriptionId) {
      return NextResponse.json({ error: 'No active Stripe subscription on file.' }, { status: 400 });
    }

    const currentSubscription = await stripe.subscriptions.retrieve(subscriptionId, {
      expand: ['items.data.price'],
    });
    const isUpgrade = planOrder(targetTier) > planOrder(currentTier as AppointmentsTier);
    const updated = await stripe.subscriptions.update(subscriptionId, {
      items: subscriptionItemsForTier(currentSubscription, targetTier),
      proration_behavior: isUpgrade ? 'always_invoice' : 'create_prorations',
      payment_behavior: 'error_if_incomplete',
      metadata: {
        ...currentSubscription.metadata,
        plan: targetTier,
        pricing_tier: targetTier,
      },
      expand: ['items.data.price'],
    });

    const ids = getPersistedSubscriptionItemIds(updated);
    await admin
      .from('venues')
      .update({
        pricing_tier: targetTier,
        plan_status: mapStripeSubscriptionToPlanStatus(updated),
        stripe_subscription_item_id: ids.mainSubscriptionItemId,
        stripe_sms_subscription_item_id: ids.smsSubscriptionItemId,
        subscription_current_period_start: subscriptionPeriodStartIso(updated),
        subscription_current_period_end: subscriptionPeriodEndIso(updated),
        calendar_count: targetTier === 'light' ? 1 : null,
      })
      .eq('id', staff.venue_id);
    await updateVenueSmsMonthlyAllowance(staff.venue_id);

    return NextResponse.json({
      ok: true,
      plan_status: mapStripeSubscriptionToPlanStatus(updated),
      pricing_tier: targetTier,
      message: isUpgrade
        ? `Your plan has been upgraded to ${planDisplayName(targetTier)}. Stripe has invoiced the prorated difference for this billing period.`
        : `Your plan has been changed to ${planDisplayName(targetTier)}. Stripe has applied any prorated credit to your subscription.`,
    });
  } catch (err) {
    console.error('[appointments-plan/change] Error:', err);
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
