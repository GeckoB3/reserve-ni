import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdminClient } from '@/lib/supabase';
import { stripe } from '@/lib/stripe';
import { buildCheckoutLineItems } from '@/lib/stripe/subscription-line-items';
import { getBusinessConfig } from '@/lib/business-config';
import { FOUNDING_PARTNER_CAP } from '@/lib/pricing-constants';
import { getExistingVenueForUserEmail } from '@/lib/signup-existing-venue';
import { pricingTierToSignupFamily, signupPlanToFamily, SIGNUP_PLAN_CONFLICT_MESSAGE } from '@/lib/signup-plan-family';

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const body = await request.json();
    const { business_type, plan } = body as {
      business_type: string;
      plan: 'appointments' | 'restaurant' | 'founding';
    };

    if (!business_type || !plan) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const config = getBusinessConfig(business_type);

    const admin = getSupabaseAdminClient();
    const existingVenue = await getExistingVenueForUserEmail(admin, user.email);
    if (existingVenue) {
      const requestedFamily = signupPlanToFamily(plan);
      const existingFamily = pricingTierToSignupFamily(existingVenue.pricing_tier);
      if (existingFamily !== requestedFamily) {
        return NextResponse.json(
          { error: SIGNUP_PLAN_CONFLICT_MESSAGE, code: 'PLAN_FAMILY_MISMATCH' },
          { status: 409 },
        );
      }
      return NextResponse.json({ redirect_url: '/onboarding' });
    }

    // Founding Partner: skip Stripe, create venue directly
    if (plan === 'founding') {
      if (config.model !== 'table_reservation') {
        return NextResponse.json(
          { error: 'Founding Partner plan is only available for hospitality businesses' },
          { status: 400 }
        );
      }
      const { count: foundingCount, error: foundingCountErr } = await admin
        .from('venues')
        .select('id', { count: 'exact', head: true })
        .eq('pricing_tier', 'founding');
      if (!foundingCountErr) {
        if ((foundingCount ?? 0) >= FOUNDING_PARTNER_CAP) {
          return NextResponse.json(
            { error: 'Founding Partner places are full. Please choose the Business plan.' },
            { status: 400 },
          );
        }
      }

      const slug = `venue-${Date.now()}`;
      const foundingEnd = new Date();
      foundingEnd.setMonth(foundingEnd.getMonth() + 6);

      const { data: venue, error: venueError } = await admin
        .from('venues')
        .insert({
          name: 'My Business',
          slug,
          booking_model: config.model,
          business_type,
          business_category: config.category,
          terminology: config.terms,
          pricing_tier: 'founding',
          plan_status: 'active',
          calendar_count: null,
          onboarding_step: 0,
          onboarding_completed: false,
          founding_free_period_ends_at: foundingEnd.toISOString(),
        })
        .select('id')
        .single();

      if (venueError || !venue) {
        return NextResponse.json(
          { error: 'Failed to create venue: ' + (venueError?.message ?? 'unknown') },
          { status: 500 }
        );
      }

      const { error: staffError } = await admin.from('staff').insert({
        venue_id: venue.id,
        email: user.email,
        name: user.email?.split('@')[0] ?? 'Admin',
        role: 'admin',
      });

      if (staffError) {
        return NextResponse.json(
          { error: 'Failed to create staff record: ' + staffError.message },
          { status: 500 }
        );
      }

      return NextResponse.json({ redirect_url: '/onboarding' });
    }

    // Create Stripe Checkout Session for paid plans
    const priceIdMap: Record<string, string | undefined> = {
      appointments: process.env.STRIPE_APPOINTMENTS_PRICE_ID,
      restaurant: process.env.STRIPE_RESTAURANT_PRICE_ID,
    };
    const priceId = priceIdMap[plan];

    if (!priceId) {
      return NextResponse.json(
        { error: 'Stripe price not configured. Run scripts/create-stripe-products.ts first.' },
        { status: 500 }
      );
    }

    const existingCustomers = await stripe.customers.list({
      email: user.email ?? undefined,
      limit: 1,
    });
    const customer = existingCustomers.data[0] ?? await stripe.customers.create({
      email: user.email,
      metadata: {
        supabase_user_id: user.id,
        business_type,
        plan,
      },
    });

    const quantity = 1;

    const origin =
      process.env.NEXT_PUBLIC_BASE_URL ||
      request.headers.get('origin') ||
      'http://localhost:3000';

    const session = await stripe.checkout.sessions.create({
      customer: customer.id,
      mode: 'subscription',
      line_items: buildCheckoutLineItems(priceId, quantity),
      metadata: {
        supabase_user_id: user.id,
        user_id: user.id,
        business_type,
        plan,
        pricing_tier: plan,
        calendar_count: String(quantity),
        booking_model: config.model,
        business_category: config.category,
      },
      success_url: `${origin}/signup/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/signup/payment`,
    });

    return NextResponse.json({ redirect_url: session.url });
  } catch (err) {
    console.error('[create-checkout] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
