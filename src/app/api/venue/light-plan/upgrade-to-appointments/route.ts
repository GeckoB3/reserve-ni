import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getVenueStaff, requireAdmin } from '@/lib/venue-auth';
import { stripe } from '@/lib/stripe';
import { buildCheckoutLineItems } from '@/lib/stripe/subscription-line-items';

/**
 * POST /api/venue/light-plan/upgrade-to-appointments
 * Stripe Checkout for full Appointments; webhook cancels the Light subscription and applies the new plan.
 */
export async function POST() {
  try {
    const supabase = await createClient();
    const staff = await getVenueStaff(supabase);
    if (!staff || !requireAdmin(staff)) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { data: venue, error } = await staff.db
      .from('venues')
      .select(
        'id, pricing_tier, stripe_customer_id, stripe_subscription_id, calendar_count',
      )
      .eq('id', staff.venue_id)
      .maybeSingle();

    if (error || !venue) {
      return NextResponse.json({ error: 'Venue not found' }, { status: 404 });
    }

    const tier = String((venue as { pricing_tier?: string }).pricing_tier ?? '').toLowerCase();
    if (tier !== 'light') {
      return NextResponse.json({ error: 'Upgrade is only available from Appointments Light.' }, { status: 400 });
    }

    const customerId = (venue as { stripe_customer_id?: string | null }).stripe_customer_id?.trim();
    if (!customerId) {
      return NextResponse.json({ error: 'No Stripe customer on file.' }, { status: 400 });
    }

    const appointmentsPrice = process.env.STRIPE_APPOINTMENTS_PRO_PRICE_ID?.trim();
    if (!appointmentsPrice) {
      console.error('[upgrade-to-appointments] STRIPE_APPOINTMENTS_PRO_PRICE_ID missing');
      return NextResponse.json({ error: 'Billing is not configured' }, { status: 500 });
    }

    const calendarCount = Math.max(1, (venue as { calendar_count?: number | null }).calendar_count ?? 1);
    const oldSubId =
      (venue as { stripe_subscription_id?: string | null }).stripe_subscription_id?.trim() ?? '';

    const origin = process.env.NEXT_PUBLIC_BASE_URL?.trim() || 'http://localhost:3000';

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      allow_promotion_codes: true,
      line_items: buildCheckoutLineItems(appointmentsPrice, calendarCount),
      metadata: {
        venue_id: staff.venue_id,
        action: 'upgrade_from_light',
        plan: 'appointments',
        ...(oldSubId ? { old_subscription_id: oldSubId } : {}),
      },
      success_url: `${origin}/dashboard/settings?tab=plan&upgraded=true`,
      cancel_url: `${origin}/dashboard/settings?tab=plan`,
    });

    if (!session.url) {
      return NextResponse.json({ error: 'Could not start Checkout' }, { status: 500 });
    }

    return NextResponse.json({ redirect_url: session.url });
  } catch (err) {
    console.error('[upgrade-to-appointments] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
