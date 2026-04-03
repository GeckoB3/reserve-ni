import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getVenueStaff, requireAdmin } from '@/lib/venue-auth';
import { getSupabaseAdminClient } from '@/lib/supabase';
import { matchesTimetableIntervalWeeks } from '@/lib/scheduling/class-timetable-interval';

/**
 * POST /api/venue/classes/generate-instances
 * Generates class instances from the timetable for the next N weeks.
 * Skips dates where an instance already exists.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const staff = await getVenueStaff(supabase);
    if (!staff) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    if (!requireAdmin(staff)) return NextResponse.json({ error: 'Forbidden: admin only' }, { status: 403 });

    const body = await request.json();
    const weeks = Math.min(Math.max(body.weeks ?? 4, 1), 12);

    const admin = getSupabaseAdminClient();

    const { data: classTypes } = await admin
      .from('class_types')
      .select('id')
      .eq('venue_id', staff.venue_id)
      .eq('is_active', true);

    if (!classTypes || classTypes.length === 0) {
      return NextResponse.json({ created: 0 });
    }

    const typeIds = classTypes.map((ct) => ct.id);

    const { data: timetable } = await admin
      .from('class_timetable')
      .select('*')
      .in('class_type_id', typeIds)
      .eq('is_active', true);

    if (!timetable || timetable.length === 0) {
      return NextResponse.json({ created: 0 });
    }

    // Collect existing instances so we don't duplicate
    const today = new Date();
    const endDate = new Date(today);
    endDate.setDate(endDate.getDate() + weeks * 7);

    const { data: existing } = await admin
      .from('class_instances')
      .select('class_type_id, instance_date, start_time, timetable_entry_id')
      .in('class_type_id', typeIds)
      .gte('instance_date', today.toISOString().slice(0, 10))
      .lte('instance_date', endDate.toISOString().slice(0, 10));

    const existingSet = new Set(
      (existing ?? []).map((e) => `${e.class_type_id}|${e.instance_date}|${e.start_time}`)
    );

    const toInsert: Array<{
      class_type_id: string;
      timetable_entry_id: string;
      instance_date: string;
      start_time: string;
    }> = [];

    for (let d = new Date(today); d <= endDate; d.setDate(d.getDate() + 1)) {
      const dow = d.getDay();
      const dateStr = d.toISOString().slice(0, 10);

      for (const entry of timetable) {
        if (entry.day_of_week !== dow) continue;
        const intervalWeeks = (entry as { interval_weeks?: number }).interval_weeks ?? 1;
        const createdAt = (entry as { created_at?: string }).created_at ?? `${dateStr}T00:00:00Z`;
        if (
          !matchesTimetableIntervalWeeks({
            intervalWeeks,
            timetableCreatedAt: createdAt,
            instanceDateStr: dateStr,
          })
        ) {
          continue;
        }
        const startTime = (entry.start_time as string).slice(0, 5);
        const key = `${entry.class_type_id}|${dateStr}|${startTime}`;
        if (existingSet.has(key)) continue;

        toInsert.push({
          class_type_id: entry.class_type_id,
          timetable_entry_id: entry.id,
          instance_date: dateStr,
          start_time: startTime + ':00',
        });
      }
    }

    if (toInsert.length > 0) {
      await admin.from('class_instances').insert(toInsert);
    }

    return NextResponse.json({ created: toInsert.length });
  } catch (err) {
    console.error('POST /api/venue/classes/generate-instances failed:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
