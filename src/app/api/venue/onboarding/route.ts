import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdminClient } from '@/lib/supabase';

export async function PATCH(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const admin = getSupabaseAdminClient();

    const { data: staffRows } = await admin
      .from('staff')
      .select('venue_id, role')
      .ilike('email', (user.email ?? '').toLowerCase().trim())
      .limit(1);
    const staffRow = staffRows?.[0] ?? null;

    if (!staffRow?.venue_id) {
      return NextResponse.json({ error: 'No venue found' }, { status: 404 });
    }

    const body = await request.json();
    const updates: Record<string, unknown> = {};

    if (typeof body.onboarding_step === 'number') {
      updates.onboarding_step = body.onboarding_step;
    }

    if (typeof body.onboarding_completed === 'boolean') {
      updates.onboarding_completed = body.onboarding_completed;
    }

    if (typeof body.name === 'string' && body.name.trim()) {
      updates.name = body.name.trim();
    }

    if (typeof body.address === 'string') {
      updates.address = body.address.trim();
    }

    if (typeof body.phone === 'string') {
      updates.phone = body.phone.trim();
    }

    if (typeof body.slug === 'string' && body.slug.trim()) {
      updates.slug = body.slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-');
    }

    if (typeof body.currency === 'string' && ['GBP', 'EUR'].includes(body.currency)) {
      updates.currency = body.currency;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    const { error: updateError } = await admin
      .from('venues')
      .update(updates)
      .eq('id', staffRow.venue_id);

    if (updateError) {
      return NextResponse.json(
        { error: 'Failed to update: ' + updateError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[venue/onboarding] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const admin = getSupabaseAdminClient();

    const { data: staffRows } = await admin
      .from('staff')
      .select('venue_id')
      .ilike('email', (user.email ?? '').toLowerCase().trim())
      .limit(1);
    const staffRow = staffRows?.[0] ?? null;

    if (!staffRow?.venue_id) {
      return NextResponse.json({ error: 'No venue found' }, { status: 404 });
    }

    const { data: venue, error: venueError } = await admin
      .from('venues')
      .select(
        'id, name, slug, address, phone, booking_model, business_type, business_category, terminology, pricing_tier, calendar_count, onboarding_step, onboarding_completed, currency'
      )
      .eq('id', staffRow.venue_id)
      .single();

    if (venueError || !venue) {
      return NextResponse.json({ error: 'Venue not found' }, { status: 404 });
    }

    return NextResponse.json({ venue });
  } catch (err) {
    console.error('[venue/onboarding] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
