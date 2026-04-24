import { NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { createClient } from '@/lib/supabase/server';
import { getVenueStaff, requireAdmin } from '@/lib/venue-auth';
import { stripe } from '@/lib/stripe';
import {
  findMainPlanSubscriptionItem,
  findSmsMeteredSubscriptionItem,
  getStripeAppointmentsPlusPriceId,
  getStripeAppointmentsProPriceId,
  getStripeLightPlanPriceId,
  getStripeSmsLightPriceId,
  getStripeSmsOveragePriceId,
} from '@/lib/stripe/subscription-line-items';
import { countUnifiedCalendarColumns } from '@/lib/light-plan';
import { planCalendarLimit, planStaffLimit } from '@/lib/plan-limits';
import { isUnifiedSchedulingVenue } from '@/lib/booking/unified-scheduling';
import { isAppointmentPlanTier } from '@/lib/tier-enforcement';
import { planDisplayName } from '@/lib/pricing-constants';

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
    throw new Error(`${planDisplayName(targetTier)} Stripe price is not configured`);
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
): Stripe.InvoiceCreatePreviewParams.SubscriptionDetails.Item[] {
  const mainItem = findMainPlanSubscriptionItem(subscription);
  if (!mainItem?.id) {
    throw new Error('Could not find current subscription plan item.');
  }

  const items: Stripe.InvoiceCreatePreviewParams.SubscriptionDetails.Item[] = [
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

function money(amount: number | null | undefined, currency: string | null | undefined) {
  return {
    amount_pence: amount ?? 0,
    currency: currency ?? 'gbp',
    formatted: new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: (currency ?? 'gbp').toUpperCase(),
    }).format((amount ?? 0) / 100),
  };
}

function isProrationLine(line: Stripe.InvoiceLineItem): boolean {
  const raw = line as unknown as {
    proration?: boolean;
    parent?: { subscription_item_details?: { proration?: boolean } };
  };
  return raw.proration === true || raw.parent?.subscription_item_details?.proration === true;
}

/**
 * POST /api/venue/appointments-plan/preview
 * Returns Stripe's upcoming invoice preview for an Appointments plan change.
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
    if (!isAppointmentPlanTier(currentTier) || currentTier === targetTier) {
      return NextResponse.json({ error: 'Choose a different Appointments plan.' }, { status: 400 });
    }

    const bookingModel = (venue as { booking_model?: string | null }).booking_model ?? '';
    if (!isUnifiedSchedulingVenue(bookingModel)) {
      return NextResponse.json({ error: 'Appointments plan changes require a unified scheduling venue.' }, { status: 400 });
    }

    const planStatus = String((venue as { plan_status?: string | null }).plan_status ?? '').toLowerCase().trim();
    if (planStatus === 'past_due' || planStatus === 'cancelling' || planStatus === 'cancelled') {
      return NextResponse.json({ error: 'Your current subscription must be active before changing plan.' }, { status: 400 });
    }

    const targetCalendarLimit = planCalendarLimit(targetTier);
    if (targetCalendarLimit !== Infinity) {
      const calendarCount = await countUnifiedCalendarColumns(admin, staff.venue_id);
      if (calendarCount > targetCalendarLimit) {
        return NextResponse.json({ error: `Reduce active calendars to ${targetCalendarLimit} before downgrading.` }, { status: 400 });
      }
    }

    const targetStaffLimit = planStaffLimit(targetTier);
    if (targetStaffLimit !== Infinity) {
      const { count, error: staffCountErr } = await admin
        .from('staff')
        .select('id', { count: 'exact', head: true })
        .eq('venue_id', staff.venue_id);
      if (staffCountErr) {
        return NextResponse.json({ error: 'Could not verify team size.' }, { status: 500 });
      }
      if ((count ?? 0) > targetStaffLimit) {
        return NextResponse.json({ error: `Reduce team logins to ${targetStaffLimit} before downgrading.` }, { status: 400 });
      }
    }

    const customerId = (venue as { stripe_customer_id?: string | null }).stripe_customer_id?.trim();
    const subscriptionId = (venue as { stripe_subscription_id?: string | null }).stripe_subscription_id?.trim();
    if (!customerId || !subscriptionId) {
      return NextResponse.json({ error: 'No active Stripe subscription on file.' }, { status: 400 });
    }

    const currentSubscription = await stripe.subscriptions.retrieve(subscriptionId, {
      expand: ['items.data.price'],
    });
    const isUpgrade = planOrder(targetTier) > planOrder(currentTier as AppointmentsTier);
    const preview = await stripe.invoices.createPreview({
      customer: customerId,
      subscription: subscriptionId,
      subscription_details: {
        items: subscriptionItemsForTier(currentSubscription, targetTier),
        proration_behavior: isUpgrade ? 'always_invoice' : 'create_prorations',
      },
    });

    const prorationLines = preview.lines.data.filter(isProrationLine).map((line) => ({
      description: line.description,
      ...money(line.amount, line.currency),
    }));
    const prorationTotal = prorationLines.reduce((sum, line) => sum + line.amount_pence, 0);

    return NextResponse.json({
      current_tier: currentTier,
      target_tier: targetTier,
      is_upgrade: isUpgrade,
      proration_behavior: isUpgrade ? 'always_invoice' : 'create_prorations',
      amount_due: money(preview.amount_due, preview.currency),
      proration_total: money(prorationTotal, preview.currency),
      total: money(preview.total, preview.currency),
      subtotal: money(preview.subtotal, preview.currency),
      proration_lines: prorationLines,
    });
  } catch (err) {
    console.error('[appointments-plan/preview] Error:', err);
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
