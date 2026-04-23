import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getVenueStaff, requireAdmin } from '@/lib/venue-auth';
import { stripe } from '@/lib/stripe';
import {
  getPersistedSubscriptionItemIds,
  getStripeLightPlanPriceId,
  getStripeSmsLightPriceId,
} from '@/lib/stripe/subscription-line-items';
import {
  subscriptionCancelAtPeriodEnd,
  subscriptionPeriodEndIso,
  subscriptionPeriodStartIso,
} from '@/lib/stripe/subscription-fields';
import { updateVenueSmsMonthlyAllowance } from '@/lib/billing/sms-allowance';
import { countUnifiedCalendarColumns } from '@/lib/light-plan';
import { isUnifiedSchedulingVenue } from '@/lib/booking/unified-scheduling';
import { APPOINTMENTS_LIGHT_PRICE } from '@/lib/pricing-constants';

/**
 * POST /api/venue/light-plan/downgrade-to-light
 * Validates ≤1 active calendar and ≤1 staff, cancels Appointments subscription, creates Light subscription (no new free period).
 */
export async function POST() {
  try {
    const supabase = await createClient();
    const staff = await getVenueStaff(supabase);
    if (!staff || !requireAdmin(staff)) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const admin = staff.db;
    const { data: venue, error } = await admin
      .from('venues')
      .select(
        'id, pricing_tier, booking_model, stripe_customer_id, stripe_subscription_id',
      )
      .eq('id', staff.venue_id)
      .maybeSingle();

    if (error || !venue) {
      return NextResponse.json({ error: 'Venue not found' }, { status: 404 });
    }

    const tier = String((venue as { pricing_tier?: string }).pricing_tier ?? '').toLowerCase();
    if (tier !== 'appointments' && tier !== 'plus') {
      return NextResponse.json(
        { error: 'Downgrade to Light is only available on Appointments Pro or Appointments Plus.' },
        { status: 400 },
      );
    }

    const bookingModel = (venue as { booking_model?: string }).booking_model ?? '';
    if (!isUnifiedSchedulingVenue(bookingModel)) {
      return NextResponse.json(
        { error: 'Appointments Light only supports unified scheduling. This venue is not eligible.' },
        { status: 400 },
      );
    }

    const staffVenueId = staff.venue_id;
    const { count: staffCount, error: staffErr } = await admin
      .from('staff')
      .select('id', { count: 'exact', head: true })
      .eq('venue_id', staffVenueId);

    if (staffErr) {
      console.error('[downgrade-to-light] staff count:', staffErr.message);
      return NextResponse.json({ error: 'Could not verify staff' }, { status: 500 });
    }
    if ((staffCount ?? 0) > 1) {
      return NextResponse.json(
        {
          error:
            'Remove extra team members so only one login remains, then try again. Appointments Light includes a single user.',
          code: 'LIGHT_DOWNGRADE_STAFF',
        },
        { status: 400 },
      );
    }

    const calCount = await countUnifiedCalendarColumns(admin, staffVenueId);
    if (calCount > 1) {
      return NextResponse.json(
        {
          error:
            'Deactivate extra calendars so only one bookable calendar remains, then try again.',
          code: 'LIGHT_DOWNGRADE_CALENDARS',
        },
        { status: 400 },
      );
    }

    const customerId = (venue as { stripe_customer_id?: string | null }).stripe_customer_id?.trim();
    const subscriptionId = (venue as { stripe_subscription_id?: string | null }).stripe_subscription_id?.trim();

    if (!customerId) {
      return NextResponse.json({ error: 'No Stripe customer on file.' }, { status: 400 });
    }

    const lightPrice = getStripeLightPlanPriceId();
    const smsLightPrice = getStripeSmsLightPriceId();
    if (!lightPrice?.trim() || !smsLightPrice?.trim()) {
      console.error('[downgrade-to-light] Light Stripe prices not configured');
      return NextResponse.json({ error: 'Billing is not configured' }, { status: 500 });
    }

    if (subscriptionId) {
      try {
        await stripe.subscriptions.cancel(subscriptionId);
      } catch (e) {
        console.error('[downgrade-to-light] Failed to cancel subscription', subscriptionId, e);
        return NextResponse.json({ error: 'Could not cancel current subscription' }, { status: 502 });
      }
    }

    const sub = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: lightPrice.trim() }, { price: smsLightPrice.trim() }],
      metadata: { venue_id: staffVenueId, source: 'downgrade_from_appointments' },
    });

    const ids = getPersistedSubscriptionItemIds(sub);
    const periodEndIso = subscriptionPeriodEndIso(sub);
    const periodStartIso = subscriptionPeriodStartIso(sub);
    const cancelAtPeriodEnd = subscriptionCancelAtPeriodEnd(sub);

    await admin
      .from('venues')
      .update({
        pricing_tier: 'light',
        stripe_subscription_id: sub.id,
        stripe_subscription_item_id: ids.mainSubscriptionItemId,
        stripe_sms_subscription_item_id: ids.smsSubscriptionItemId,
        subscription_current_period_start: periodStartIso,
        subscription_current_period_end: periodEndIso,
        calendar_count: 1,
        plan_status: cancelAtPeriodEnd ? 'cancelling' : sub.status === 'trialing' ? 'trialing' : 'active',
      })
      .eq('id', staffVenueId);

    await updateVenueSmsMonthlyAllowance(staffVenueId);

    return NextResponse.json({
      ok: true,
      message: `You are now on Appointments Light (£${APPOINTMENTS_LIGHT_PRICE}/month + pay-as-you-go SMS). Your calendar and team limits match this plan.`,
    });
  } catch (err) {
    console.error('[downgrade-to-light] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
