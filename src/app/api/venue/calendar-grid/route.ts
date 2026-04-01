import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getVenueStaff } from '@/lib/venue-auth';
import { getSupabaseAdminClient } from '@/lib/supabase';
import { getCalendarGrid } from '@/lib/unified-availability';
import { z } from 'zod';

const querySchema = z.object({
  calendar_ids: z.string().min(1),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

/**
 * GET /api/venue/calendar-grid?calendar_ids=id1,id2&start_date=&end_date=
 * Authenticated staff: calendar grid for dashboard.
 */
export async function GET(request: NextRequest) {
  try {
    const supabaseAuth = await createClient();
    const staff = await getVenueStaff(supabaseAuth);
    if (!staff) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    }

    const sp = request.nextUrl.searchParams;
    const parsed = querySchema.safeParse({
      calendar_ids: sp.get('calendar_ids'),
      start_date: sp.get('start_date'),
      end_date: sp.get('end_date'),
    });
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid query parameters' }, { status: 400 });
    }

    const calendarIds = parsed.data.calendar_ids
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (calendarIds.length === 0) {
      return NextResponse.json({ error: 'calendar_ids required' }, { status: 400 });
    }

    const admin = getSupabaseAdminClient();
    const grid = await getCalendarGrid({
      supabase: admin,
      venueId: staff.venue_id,
      calendarIds,
      startDate: parsed.data.start_date,
      endDate: parsed.data.end_date,
    });

    return NextResponse.json(grid);
  } catch (err) {
    console.error('[calendar-grid] GET failed:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
