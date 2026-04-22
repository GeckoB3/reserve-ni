import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getVenueStaff, requireAdmin } from '@/lib/venue-auth';
import { stripe } from '@/lib/stripe';
import { stripeCustomerHasDefaultPaymentMethod } from '@/lib/stripe/venue-customer-payment';

/**
 * GET /api/venue/light-plan/status
 * Live Stripe + DB snapshot for the Plan tab (card on file, subscription id, period dates).
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const staff = await getVenueStaff(supabase);
    if (!staff || !requireAdmin(staff)) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { data: venue, error } = await staff.db
      .from('venues')
      .select(
        'id, pricing_tier, plan_status, stripe_customer_id, stripe_subscription_id, subscription_current_period_start, subscription_current_period_end',
      )
      .eq('id', staff.venue_id)
      .maybeSingle();

    if (error || !venue) {
      return NextResponse.json({ error: 'Venue not found' }, { status: 404 });
    }

    const tier = String((venue as { pricing_tier?: string }).pricing_tier ?? '').toLowerCase();
    if (tier !== 'light') {
      return NextResponse.json({ error: 'Not an Appointments Light venue' }, { status: 400 });
    }

    const customerId = (venue as { stripe_customer_id?: string | null }).stripe_customer_id?.trim() ?? '';
    const subId = (venue as { stripe_subscription_id?: string | null }).stripe_subscription_id?.trim() ?? '';

    const has_default_payment_method = customerId ? await stripeCustomerHasDefaultPaymentMethod(customerId) : false;

    let stripe_subscription_status: string | null = null;
    if (subId) {
      try {
        const sub = await stripe.subscriptions.retrieve(subId);
        stripe_subscription_status = sub.status;
      } catch {
        stripe_subscription_status = null;
      }
    }

    return NextResponse.json({
      venue_id: staff.venue_id,
      plan_status: (venue as { plan_status?: string | null }).plan_status ?? null,
      stripe_subscription_id: subId || null,
      has_default_payment_method,
      stripe_subscription_status,
      subscription_current_period_start:
        (venue as { subscription_current_period_start?: string | null }).subscription_current_period_start ?? null,
      subscription_current_period_end:
        (venue as { subscription_current_period_end?: string | null }).subscription_current_period_end ?? null,
    });
  } catch (err) {
    console.error('[light-plan/status] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
