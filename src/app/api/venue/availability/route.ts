import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdminClient } from '@/lib/supabase';
import type { AvailabilityConfig, BlockedSlot } from '@/types/availability';

/** GET /api/venue/availability — return blocked dates/slots for the authenticated venue. */
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    }

    const { data: staffRows } = await supabase
      .from('staff')
      .select('venue_id')
      .eq('email', user.email);
    const venueId = staffRows?.[0]?.venue_id;
    if (!venueId) {
      return NextResponse.json({ error: 'No venue associated with your account' }, { status: 403 });
    }

    const admin = getSupabaseAdminClient();
    const { data: venue, error } = await admin
      .from('venues')
      .select('id, availability_config')
      .eq('id', venueId)
      .single();

    if (error || !venue) {
      return NextResponse.json({ error: 'Venue not found' }, { status: 404 });
    }

    const config = venue.availability_config as AvailabilityConfig | null;
    const blocked_dates = config?.blocked_dates ?? [];
    const blocked_slots = config?.blocked_slots ?? [];

    return NextResponse.json({
      venue_id: venueId,
      blocked_dates,
      blocked_slots,
    });
  } catch (err) {
    console.error('GET /api/venue/availability failed:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/** POST /api/venue/availability — add or remove a blocked date or slot. */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    }

    const { data: staffRows } = await supabase
      .from('staff')
      .select('venue_id')
      .eq('email', user.email);
    const venueId = staffRows?.[0]?.venue_id;
    if (!venueId) {
      return NextResponse.json({ error: 'No venue associated with your account' }, { status: 403 });
    }

    const body = await request.json();
    const { action, blocked_date, blocked_slot } = body as {
      action: 'add' | 'remove';
      blocked_date?: string;
      blocked_slot?: BlockedSlot;
    };

    if (action !== 'add' && action !== 'remove') {
      return NextResponse.json({ error: 'Invalid action; use add or remove' }, { status: 400 });
    }

    const admin = getSupabaseAdminClient();
    const { data: venue, error: fetchError } = await admin
      .from('venues')
      .select('id, availability_config')
      .eq('id', venueId)
      .single();

    if (fetchError || !venue) {
      return NextResponse.json({ error: 'Venue not found' }, { status: 404 });
    }

    const config = (venue.availability_config as AvailabilityConfig) ?? { model: 'fixed_intervals', interval_minutes: 30 };
    const blocked_dates: string[] = Array.isArray(config.blocked_dates) ? [...config.blocked_dates] : [];
    const blocked_slots: BlockedSlot[] = Array.isArray(config.blocked_slots) ? [...config.blocked_slots] : [];

    if (blocked_date) {
      const dateStr = String(blocked_date).trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        return NextResponse.json({ error: 'blocked_date must be YYYY-MM-DD' }, { status: 400 });
      }
      if (action === 'add') {
        if (!blocked_dates.includes(dateStr)) blocked_dates.push(dateStr);
      } else {
        const i = blocked_dates.indexOf(dateStr);
        if (i !== -1) blocked_dates.splice(i, 1);
      }
    } else if (blocked_slot) {
      const { date, start_time, end_time } = blocked_slot;
      if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(String(date))) {
        return NextResponse.json({ error: 'blocked_slot.date must be YYYY-MM-DD' }, { status: 400 });
      }
      const entry: BlockedSlot = { date: String(date), start_time, end_time };
      if (action === 'add') {
        const exists = blocked_slots.some(
          (s) => s.date === entry.date && s.start_time === entry.start_time && s.end_time === entry.end_time
        );
        if (!exists) blocked_slots.push(entry);
      } else {
        const i = blocked_slots.findIndex(
          (s) => s.date === entry.date && s.start_time === entry.start_time && s.end_time === entry.end_time
        );
        if (i !== -1) blocked_slots.splice(i, 1);
      }
    } else {
      return NextResponse.json(
        { error: 'Provide either blocked_date or blocked_slot in body' },
        { status: 400 }
      );
    }

    const updated = { ...config, blocked_dates, blocked_slots };

    const { error: updateError } = await admin
      .from('venues')
      .update({ availability_config: updated, updated_at: new Date().toISOString() })
      .eq('id', venueId);

    if (updateError) {
      console.error('Update availability_config failed:', updateError);
      return NextResponse.json({ error: 'Failed to update blocks' }, { status: 500 });
    }

    return NextResponse.json({
      venue_id: venueId,
      blocked_dates,
      blocked_slots,
    });
  } catch (err) {
    console.error('POST /api/venue/availability failed:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
