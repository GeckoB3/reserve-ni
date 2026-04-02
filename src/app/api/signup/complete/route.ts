import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdminClient } from '@/lib/supabase';
import { stripe } from '@/lib/stripe';
import { getPersistedSubscriptionItemIds } from '@/lib/stripe/subscription-line-items';
import { getBusinessConfig } from '@/lib/business-config';
import { updateVenueSmsMonthlyAllowance } from '@/lib/billing/sms-allowance';
import { isUnifiedSchedulingVenue } from '@/lib/booking/unified-scheduling';
import { mergeNotificationSettingsPatch, parseNotificationSettings } from '@/lib/notifications/notification-settings';

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

    const subscriptionId =
      typeof session.subscription === 'string'
        ? session.subscription
        : session.subscription && typeof session.subscription === 'object'
          ? session.subscription.id
          : null;

    let mainSubscriptionItemId: string | null = null;
    let smsSubscriptionItemId: string | null = null;
    if (subscriptionId) {
      try {
        const subFull = await stripe.subscriptions.retrieve(subscriptionId);
        const ids = getPersistedSubscriptionItemIds(subFull);
        mainSubscriptionItemId = ids.mainSubscriptionItemId;
        smsSubscriptionItemId = ids.smsSubscriptionItemId;
      } catch (e) {
        console.warn('[signup/complete] Could not load subscription items:', e);
      }
    }

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
        stripe_subscription_id: subscriptionId,
        stripe_subscription_item_id: mainSubscriptionItemId,
        stripe_sms_subscription_item_id: smsSubscriptionItemId,
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

    await updateVenueSmsMonthlyAllowance(venue.id);

    /** Unified appointment venues: confirmation email on, confirmation SMS off by default (opt in under Communications). */
    if (isUnifiedSchedulingVenue(config.model)) {
      const defaults = parseNotificationSettings(null);
      const notification_settings = mergeNotificationSettingsPatch(defaults, {
        confirmation_channels: ['email'],
      });
      const { error: notifErr } = await admin
        .from('venues')
        .update({ notification_settings: notification_settings as unknown as Record<string, never> })
        .eq('id', venue.id);
      if (notifErr) {
        console.warn('[signup/complete] Could not set default notification_settings for unified venue:', notifErr);
      }
    }

    return NextResponse.json({ redirect_url: '/onboarding' });
  } catch (err) {
    console.error('[signup/complete] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
