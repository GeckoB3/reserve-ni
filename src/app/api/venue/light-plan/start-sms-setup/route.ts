import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getVenueStaff, requireAdmin } from '@/lib/venue-auth';
import { stripe } from '@/lib/stripe';

/**
 * POST /api/venue/light-plan/start-sms-setup
 * Opens Stripe Setup Checkout:
 * - No subscription yet → webhook creates Light sub (£5 deferred + metered SMS).
 * - past_due with subscription → webhook attaches card and retries open invoices (`light_payment_method_update`).
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
      .select('id, pricing_tier, stripe_customer_id, stripe_subscription_id, plan_status')
      .eq('id', staff.venue_id)
      .maybeSingle();

    if (error || !venue) {
      console.error('[light-plan/start-sms-setup] venue load failed:', error?.message);
      return NextResponse.json({ error: 'Venue not found' }, { status: 404 });
    }

    const tier = String((venue as { pricing_tier?: string }).pricing_tier ?? '').toLowerCase();
    if (tier !== 'light') {
      return NextResponse.json(
        { error: 'This action is only for Appointments Light venues.' },
        { status: 400 },
      );
    }

    const customerId = (venue as { stripe_customer_id?: string | null }).stripe_customer_id?.trim();
    if (!customerId) {
      return NextResponse.json(
        { error: 'No Stripe customer on file. Complete signup first.' },
        { status: 400 },
      );
    }

    const subId = (venue as { stripe_subscription_id?: string | null }).stripe_subscription_id?.trim();
    const venuePlanStatus = String((venue as { plan_status?: string | null }).plan_status ?? '')
      .toLowerCase()
      .trim();

    let setupAction: 'light_sms_setup' | 'light_payment_method_update' = 'light_sms_setup';
    if (subId) {
      if (venuePlanStatus === 'past_due') {
        setupAction = 'light_payment_method_update';
      } else {
        return NextResponse.json(
          { error: 'A subscription is already on file. Use Cancel plan if you need to change billing.' },
          { status: 400 },
        );
      }
    }

    const origin = process.env.NEXT_PUBLIC_BASE_URL?.trim() || 'http://localhost:3000';

    const session = await stripe.checkout.sessions.create({
      mode: 'setup',
      customer: customerId,
      payment_method_types: ['card'],
      metadata: {
        venue_id: staff.venue_id,
        action: setupAction,
      },
      success_url: `${origin}/dashboard/settings?tab=plan&light_sms_setup=1`,
      cancel_url: `${origin}/dashboard/settings?tab=plan`,
    });

    if (!session.url) {
      return NextResponse.json({ error: 'Could not start Checkout' }, { status: 500 });
    }

    return NextResponse.json({ redirect_url: session.url });
  } catch (err) {
    console.error('[light-plan/start-sms-setup] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
