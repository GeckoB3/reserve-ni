import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getVenueStaff, requireAdmin } from '@/lib/venue-auth';
import { getSupabaseAdminClient } from '@/lib/supabase';
import { assertCalendarSlotAvailable } from '@/lib/light-plan';
import { planDisplayName } from '@/lib/pricing-constants';
import { z } from 'zod';

const createBodySchema = z.object({
  name: z.string().min(1).max(200),
});

/**
 * POST /api/venue/calendar-columns
 * Admin: create a new unified_calendars row (same shape as a team/practitioner column) so a resource
 * can use it as display_on_calendar_id. Treated like any other non-resource calendar column.
 * Dashboard UIs should direct users to /dashboard/calendar-availability?tab=calendars (Calendars tab) as the primary place to create calendars.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const staff = await getVenueStaff(supabase);
    if (!staff) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    if (!requireAdmin(staff)) return NextResponse.json({ error: 'Forbidden: admin only' }, { status: 403 });

    const body = await request.json();
    const parsed = createBodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
    }

    const admin = getSupabaseAdminClient();

    const limit = await assertCalendarSlotAvailable(staff.venue_id);
    if (!limit.allowed) {
      const { data: vrow } = await admin
        .from('venues')
        .select('pricing_tier')
        .eq('id', staff.venue_id)
        .maybeSingle();
      const tierLabel = planDisplayName((vrow as { pricing_tier?: string } | null)?.pricing_tier);
      return NextResponse.json(
        {
          error: `Your ${tierLabel} plan includes up to ${limit.limit} calendar column(s). Upgrade to add more.`,
          code: 'PLAN_CALENDAR_LIMIT',
        },
        { status: 403 },
      );
    }

    const { data: maxRows } = await admin
      .from('unified_calendars')
      .select('sort_order')
      .eq('venue_id', staff.venue_id)
      .order('sort_order', { ascending: false })
      .limit(1);

    const maxSort = (maxRows?.[0] as { sort_order?: number } | undefined)?.sort_order;
    const nextSort = typeof maxSort === 'number' ? maxSort + 1 : 0;

    const calendarId = randomUUID();
    const { data: row, error } = await admin
      .from('unified_calendars')
      .insert({
        id: calendarId,
        venue_id: staff.venue_id,
        name: parsed.data.name.trim(),
        staff_id: null,
        slug: null,
        working_hours: {},
        break_times: [],
        break_times_by_day: null,
        days_off: [],
        sort_order: nextSort,
        is_active: true,
        colour: '#3B82F6',
        calendar_type: 'practitioner',
      })
      .select('id, name')
      .single();

    if (error) {
      console.error('POST /api/venue/calendar-columns failed:', error);
      return NextResponse.json({ error: 'Failed to create calendar column' }, { status: 500 });
    }

    return NextResponse.json(
      { id: row.id as string, name: row.name as string },
      { status: 201 },
    );
  } catch (err) {
    console.error('POST /api/venue/calendar-columns failed:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
