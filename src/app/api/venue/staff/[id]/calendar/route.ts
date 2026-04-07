import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getVenueStaff, requireAdmin } from '@/lib/venue-auth';
import { getSupabaseAdminClient } from '@/lib/supabase';
import { setStaffUnifiedCalendarAssignments } from '@/lib/staff-practitioner-link';
import { z } from 'zod';

const bodySchema = z.object({
  /** Full list of bookable calendars this staff member may manage (replaces any previous selection). */
  calendar_ids: z.array(z.string().uuid()),
});

/**
 * PATCH /api/venue/staff/[id]/calendar
 * Admin: assign staff to any combination of bookable calendars (unified scheduling).
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const supabase = await createClient();
    const staff = await getVenueStaff(supabase);
    if (!staff) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    if (!requireAdmin(staff)) return NextResponse.json({ error: 'Forbidden: admin only' }, { status: 403 });

    const { id: targetStaffId } = await params;
    const body = await request.json();
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
    }

    const admin = getSupabaseAdminClient();

    const { data: target } = await admin
      .from('staff')
      .select('id, role')
      .eq('id', targetStaffId)
      .eq('venue_id', staff.venue_id)
      .maybeSingle();

    if (!target) {
      return NextResponse.json({ error: 'Staff member not found' }, { status: 404 });
    }
    if (target.role === 'admin') {
      return NextResponse.json(
        { error: 'Admin users are not calendar-restricted.' },
        { status: 400 },
      );
    }

    const result = await setStaffUnifiedCalendarAssignments(
      admin,
      staff.venue_id,
      targetStaffId,
      parsed.data.calendar_ids,
    );

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    let summary: string | null = null;
    if (parsed.data.calendar_ids.length > 0) {
      const { data: ucRows } = await admin
        .from('unified_calendars')
        .select('id, name')
        .eq('venue_id', staff.venue_id)
        .in('id', parsed.data.calendar_ids);

      const idToName = new Map(
        (ucRows ?? []).map((r) => [r.id as string, ((r.name as string) ?? '').trim() || 'Calendar']),
      );
      const names = parsed.data.calendar_ids.map((id) => idToName.get(id) ?? id);
      summary = names.join(', ');
    }

    return NextResponse.json({
      linked_calendar_ids: parsed.data.calendar_ids,
      linked_practitioner_id: parsed.data.calendar_ids[0] ?? null,
      linked_practitioner_name: summary,
    });
  } catch (err) {
    console.error('PATCH /api/venue/staff/[id]/calendar failed:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
