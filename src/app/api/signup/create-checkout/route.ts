import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdminClient } from '@/lib/supabase';
import { stripe } from '@/lib/stripe';
import { buildCheckoutLineItems } from '@/lib/stripe/subscription-line-items';
import { getBusinessConfig } from '@/lib/business-config';
import { updateVenueSmsMonthlyAllowance } from '@/lib/billing/sms-allowance';
import { FOUNDING_PARTNER_CAP } from '@/lib/pricing-constants';
import { getExistingVenueForUserEmail } from '@/lib/signup-existing-venue';
import { pricingTierToSignupFamily, signupPlanToFamily, SIGNUP_PLAN_CONFLICT_MESSAGE } from '@/lib/signup-plan-family';
import { clearSignupPendingUserMetadata } from '@/lib/signup-pending-metadata';
import { communicationPoliciesEmailOnlyAppointmentsLane } from '@/lib/communications/policies';
import { defaultNotificationSettingsForLightPlan } from '@/lib/notifications/notification-settings';

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
    const { business_type: rawBusinessType, plan } = body as {
      business_type?: string | null;
      plan: 'appointments' | 'light' | 'restaurant' | 'founding';
    };
    const business_type = rawBusinessType?.trim() || (plan === 'appointments' || plan === 'light' ? 'other' : '');

    if (!plan || (plan !== 'appointments' && plan !== 'light' && !business_type)) {
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
      if (
        (existingVenue.pricing_tier === 'appointments' || existingVenue.pricing_tier === 'light') &&
        Array.isArray((existingVenue as { active_booking_models?: unknown }).active_booking_models) &&
        ((existingVenue as { active_booking_models?: unknown[] }).active_booking_models?.length ?? 0) === 0
      ) {
        return NextResponse.json({ redirect_url: '/signup/booking-models' });
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

      const ownerEmail = (user.email ?? '').trim().toLowerCase() || null;

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
          email: ownerEmail,
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

      await clearSignupPendingUserMetadata(admin, user.id);

      return NextResponse.json({ redirect_url: '/onboarding' });
    }

    // Appointments Light: no payment at signup; Stripe Customer only for later SMS / paid period.
    if (plan === 'light') {
      if (config.model === 'table_reservation') {
        return NextResponse.json(
          { error: 'Appointments Light is only available for non-restaurant businesses.' },
          { status: 400 },
        );
      }

      const existingCustomers = await stripe.customers.list({
        email: user.email ?? undefined,
        limit: 1,
      });
      const customer =
        existingCustomers.data[0] ??
        (await stripe.customers.create({
          email: user.email ?? undefined,
          metadata: {
            supabase_user_id: user.id,
            business_type,
            plan: 'light',
          },
        }));

      const freeEnd = new Date();
      freeEnd.setMonth(freeEnd.getMonth() + 3);
      const slug = `venue-${Date.now()}`;

      const commPolicies = communicationPoliciesEmailOnlyAppointmentsLane();
      const notifDefaults = defaultNotificationSettingsForLightPlan();

      const ownerEmail = (user.email ?? '').trim().toLowerCase() || null;

      const { data: venue, error: venueError } = await admin
        .from('venues')
        .insert({
          name: 'My Business',
          slug,
          booking_model: config.model,
          business_type,
          business_category: config.category,
          terminology: config.terms,
          pricing_tier: 'light',
          plan_status: 'active',
          calendar_count: 1,
          sms_monthly_allowance: 0,
          light_plan_free_period_ends_at: freeEnd.toISOString(),
          stripe_customer_id: customer.id,
          stripe_subscription_id: null,
          stripe_subscription_item_id: null,
          stripe_sms_subscription_item_id: null,
          onboarding_step: 0,
          onboarding_completed: false,
          communication_policies: commPolicies as unknown as Record<string, never>,
          notification_settings: notifDefaults as unknown as Record<string, never>,
          email: ownerEmail,
        })
        .select('id')
        .single();

      if (venueError || !venue) {
        return NextResponse.json(
          { error: 'Failed to create venue: ' + (venueError?.message ?? 'unknown') },
          { status: 500 },
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
          { status: 500 },
        );
      }

      await updateVenueSmsMonthlyAllowance(venue.id);
      await clearSignupPendingUserMetadata(admin, user.id);

      return NextResponse.json({ redirect_url: '/signup/booking-models' });
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
      allow_promotion_codes: true,
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
