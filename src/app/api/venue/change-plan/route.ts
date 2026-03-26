import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdminClient } from '@/lib/supabase';
import { stripe } from '@/lib/stripe';

/**
 * POST /api/venue/change-plan
 * Handle plan changes: upgrade (standard->business), downgrade (business->standard), cancel.
 * Body: { action: 'upgrade' | 'downgrade' | 'cancel' | 'resubscribe', calendar_count?: number }
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
      .select('id, pricing_tier, stripe_customer_id, stripe_subscription_id')
      .eq('id', staffRow.venue_id)
      .single();

    if (!venue) return NextResponse.json({ error: 'Venue not found' }, { status: 404 });

    const body = await request.json();
    const { action, calendar_count } = body as {
      action: 'upgrade' | 'downgrade' | 'cancel' | 'resubscribe';
      calendar_count?: number;
    };

    const origin = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';

    switch (action) {
      case 'upgrade': {
        // Standard -> Business: create new Checkout Session for Business price
        const businessPriceId = process.env.STRIPE_BUSINESS_PRICE_ID;
        if (!businessPriceId) {
          return NextResponse.json({ error: 'Business price not configured' }, { status: 500 });
        }

        const session = await stripe.checkout.sessions.create({
          customer: venue.stripe_customer_id as string,
          mode: 'subscription',
          line_items: [{ price: businessPriceId, quantity: 1 }],
          metadata: {
            venue_id: venue.id,
            plan: 'business',
            action: 'upgrade',
            old_subscription_id: venue.stripe_subscription_id ?? '',
          },
          success_url: `${origin}/dashboard/settings?upgraded=true`,
          cancel_url: `${origin}/dashboard/settings`,
        });

        return NextResponse.json({ redirect_url: session.url });
      }

      case 'downgrade': {
        // Business -> Standard
        const standardPriceId = process.env.STRIPE_STANDARD_PRICE_ID;
        if (!standardPriceId) {
          return NextResponse.json({ error: 'Standard price not configured' }, { status: 500 });
        }

        const qty = calendar_count ?? 1;

        const session = await stripe.checkout.sessions.create({
          customer: venue.stripe_customer_id as string,
          mode: 'subscription',
          line_items: [{ price: standardPriceId, quantity: qty }],
          metadata: {
            venue_id: venue.id,
            plan: 'standard',
            action: 'downgrade',
            calendar_count: String(qty),
            old_subscription_id: venue.stripe_subscription_id ?? '',
          },
          success_url: `${origin}/dashboard/settings?downgraded=true`,
          cancel_url: `${origin}/dashboard/settings`,
        });

        return NextResponse.json({ redirect_url: session.url });
      }

      case 'cancel': {
        if (!venue.stripe_subscription_id) {
          return NextResponse.json({ error: 'No active subscription' }, { status: 400 });
        }
        await stripe.subscriptions.update(venue.stripe_subscription_id as string, {
          cancel_at_period_end: true,
        });
        return NextResponse.json({ ok: true, message: 'Subscription will cancel at end of billing period' });
      }

      case 'resubscribe': {
        // Re-create a checkout session for the current tier
        const priceId =
          (venue.pricing_tier as string) === 'standard'
            ? process.env.STRIPE_STANDARD_PRICE_ID
            : process.env.STRIPE_BUSINESS_PRICE_ID;

        if (!priceId) {
          return NextResponse.json({ error: 'Price not configured' }, { status: 500 });
        }

        const session = await stripe.checkout.sessions.create({
          customer: venue.stripe_customer_id as string,
          mode: 'subscription',
          line_items: [{ price: priceId, quantity: 1 }],
          metadata: {
            venue_id: venue.id,
            plan: venue.pricing_tier as string,
            action: 'resubscribe',
          },
          success_url: `${origin}/dashboard/settings?resubscribed=true`,
          cancel_url: `${origin}/dashboard/settings`,
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
