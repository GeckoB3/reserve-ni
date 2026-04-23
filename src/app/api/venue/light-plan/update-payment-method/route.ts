import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getVenueStaff, requireAdmin } from '@/lib/venue-auth';
import { stripe } from '@/lib/stripe';

/**
 * POST /api/venue/light-plan/update-payment-method
 * Setup Checkout to add/replace card on the Stripe customer (Light plan past_due recovery).
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
      .select('id, pricing_tier, stripe_customer_id')
      .eq('id', staff.venue_id)
      .maybeSingle();

    if (error || !venue) {
      return NextResponse.json({ error: 'Venue not found' }, { status: 404 });
    }

    const tier = String((venue as { pricing_tier?: string }).pricing_tier ?? '').toLowerCase();
    if (tier !== 'light') {
      return NextResponse.json({ error: 'Only available on Appointments Light.' }, { status: 400 });
    }

    const customerId = (venue as { stripe_customer_id?: string | null }).stripe_customer_id?.trim();
    if (!customerId) {
      return NextResponse.json({ error: 'No Stripe customer on file.' }, { status: 400 });
    }

    const origin = process.env.NEXT_PUBLIC_BASE_URL?.trim() || 'http://localhost:3000';

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'setup',
      payment_method_types: ['card'],
      metadata: {
        venue_id: staff.venue_id,
        action: 'light_payment_method_update',
      },
      success_url: `${origin}/dashboard/settings?tab=plan&card_updated=1`,
      cancel_url: `${origin}/dashboard/settings?tab=plan`,
    });

    if (!session.url) {
      return NextResponse.json({ error: 'Could not start Checkout' }, { status: 500 });
    }

    return NextResponse.json({ redirect_url: session.url });
  } catch (err) {
    console.error('[update-payment-method] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
