import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdminClient } from '@/lib/supabase';
import { stripe } from '@/lib/stripe';

/**
 * POST /api/venue/update-subscription
 * Update the calendar count (quantity) on a Standard tier subscription.
 * Body: { calendar_count: number }
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const admin = getSupabaseAdminClient();
    const { data: staffRow } = await admin
      .from('staff')
      .select('venue_id, role')
      .ilike('email', (user.email ?? '').toLowerCase().trim())
      .limit(1)
      .single();

    if (!staffRow?.venue_id || staffRow.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { data: venue } = await admin
      .from('venues')
      .select('pricing_tier, stripe_subscription_id, stripe_subscription_item_id, booking_model')
      .eq('id', staffRow.venue_id)
      .single();

    if (!venue) return NextResponse.json({ error: 'Venue not found' }, { status: 404 });

    if ((venue.pricing_tier as string) !== 'standard') {
      return NextResponse.json({ error: 'Only Standard tier supports calendar count changes' }, { status: 400 });
    }

    if (!venue.stripe_subscription_item_id) {
      return NextResponse.json({ error: 'No subscription item found' }, { status: 400 });
    }

    const body = await request.json();
    const newCount = body.calendar_count;
    if (typeof newCount !== 'number' || newCount < 1 || !Number.isInteger(newCount)) {
      return NextResponse.json({ error: 'Invalid calendar_count' }, { status: 400 });
    }

    if ((venue.booking_model as string) === 'practitioner_appointment') {
      const { count: pracCount, error: pracErr } = await admin
        .from('practitioners')
        .select('id', { count: 'exact', head: true })
        .eq('venue_id', staffRow.venue_id)
        .eq('is_active', true);
      if (pracErr) {
        console.error('[update-subscription] practitioner count failed:', pracErr);
        return NextResponse.json({ error: 'Failed to validate team size' }, { status: 500 });
      }
      const minCalendars = Math.max(1, pracCount ?? 0);
      if (newCount < minCalendars) {
        return NextResponse.json(
          {
            error: `You have ${pracCount} active team member(s). Set calendars to at least ${minCalendars}, or remove or deactivate team members first.`,
          },
          { status: 400 },
        );
      }
    }

    await stripe.subscriptionItems.update(venue.stripe_subscription_item_id as string, {
      quantity: newCount,
    });

    await admin
      .from('venues')
      .update({ calendar_count: newCount })
      .eq('id', staffRow.venue_id);

    return NextResponse.json({ ok: true, calendar_count: newCount });
  } catch (err) {
    console.error('[update-subscription] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
