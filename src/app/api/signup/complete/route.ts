import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdminClient } from '@/lib/supabase';
import { stripe } from '@/lib/stripe';
import { getBusinessConfig } from '@/lib/business-config';

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
    const { session_id } = body as { session_id: string };

    if (!session_id) {
      return NextResponse.json({ error: 'Missing session_id' }, { status: 400 });
    }

    const session = await stripe.checkout.sessions.retrieve(session_id, {
      expand: ['subscription'],
    });

    if (session.payment_status !== 'paid' && session.status !== 'complete') {
      return NextResponse.json({ error: 'Payment not completed' }, { status: 400 });
    }

    // Verify this checkout session belongs to the authenticated user
    if (session.metadata?.supabase_user_id && session.metadata.supabase_user_id !== user.id) {
      return NextResponse.json({ error: 'Session does not belong to this user' }, { status: 403 });
    }

    const admin = getSupabaseAdminClient();

    // Check if venue already exists for this user (idempotency)
    const { data: existingStaff } = await admin
      .from('staff')
      .select('venue_id')
      .ilike('email', (user.email ?? '').toLowerCase().trim())
      .limit(1);

    if (existingStaff && existingStaff.length > 0) {
      return NextResponse.json({ redirect_url: '/onboarding' });
    }

    const metadata = session.metadata ?? {};
    const businessType = metadata.business_type ?? 'other';
    const plan = metadata.plan ?? 'business';
    const calendarCount = parseInt(metadata.calendar_count ?? '1', 10);
    const config = getBusinessConfig(businessType);

    const subscription =
      typeof session.subscription === 'object' ? session.subscription : null;

    const subscriptionItemId = subscription?.items?.data?.[0]?.id ?? null;

    const slug = `venue-${Date.now()}`;

    const { data: venue, error: venueError } = await admin
      .from('venues')
      .insert({
        name: 'My Business',
        slug,
        booking_model: config.model,
        business_type: businessType,
        business_category: config.category,
        terminology: config.terms,
        pricing_tier: plan,
        plan_status: 'active',
        stripe_customer_id: session.customer as string,
        stripe_subscription_id:
          typeof session.subscription === 'string'
            ? session.subscription
            : subscription?.id ?? null,
        stripe_subscription_item_id: subscriptionItemId,
        calendar_count: plan === 'standard' ? calendarCount : null,
        onboarding_step: 0,
        onboarding_completed: false,
      })
      .select('id')
      .single();

    if (venueError || !venue) {
      console.error('[signup/complete] Venue creation failed:', venueError);
      return NextResponse.json({ error: 'Failed to complete signup. Please contact support.' }, { status: 500 });
    }

    const { error: staffError } = await admin.from('staff').insert({
      venue_id: venue.id,
      email: user.email,
      name: user.email?.split('@')[0] ?? 'Admin',
      role: 'admin',
    });

    if (staffError) {
      console.error('[signup/complete] Staff creation failed:', staffError);
      return NextResponse.json({ error: 'Failed to complete signup. Please contact support.' }, { status: 500 });
    }

    return NextResponse.json({ redirect_url: '/onboarding' });
  } catch (err) {
    console.error('[signup/complete] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
