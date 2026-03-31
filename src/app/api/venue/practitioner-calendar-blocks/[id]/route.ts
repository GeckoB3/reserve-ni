import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getVenueStaff } from '@/lib/venue-auth';
import { z } from 'zod';

const patchBodySchema = z.object({
  end_time: z.string().regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$/).optional(),
  reason: z.string().max(500).nullable().optional(),
});

function normalizeTimeForDb(t: string): string {
  return t.length === 5 ? `${t}:00` : t;
}

function timeToMinutes(t: string): number {
  const part = t.slice(0, 8);
  const [hh, mm] = part.split(':').map(Number);
  return (hh ?? 0) * 60 + (mm ?? 0);
}

/** PATCH — update block end time and/or reason. */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const supabase = await createClient();
    const staff = await getVenueStaff(supabase);
    if (!staff) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    }

    const { id } = await params;
    const parsed = patchBodySchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
    }

    const { data: existing, error: fetchErr } = await staff.db
      .from('practitioner_calendar_blocks')
      .select('id, venue_id, start_time, end_time, reason, practitioner_id, block_date')
      .eq('id', id)
      .eq('venue_id', staff.venue_id)
      .maybeSingle();

    if (fetchErr || !existing) {
      return NextResponse.json({ error: 'Block not found' }, { status: 404 });
    }

    const updates: Record<string, unknown> = {};
    const startRaw = typeof existing.start_time === 'string' ? existing.start_time : String(existing.start_time);

    if (parsed.data.end_time !== undefined) {
      const endNorm = normalizeTimeForDb(parsed.data.end_time);
      const startNorm = startRaw.length === 5 ? `${startRaw}:00` : startRaw;
      if (timeToMinutes(endNorm) <= timeToMinutes(startNorm)) {
        return NextResponse.json({ error: 'End time must be after start time' }, { status: 400 });
      }
      updates.end_time = endNorm;
    }

    if (parsed.data.reason !== undefined) {
      updates.reason = parsed.data.reason === '' ? null : parsed.data.reason;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    const { data: updated, error } = await staff.db
      .from('practitioner_calendar_blocks')
      .update(updates)
      .eq('id', id)
      .eq('venue_id', staff.venue_id)
      .select()
      .single();

    if (error) {
      console.error('PATCH practitioner-calendar-blocks:', error);
      return NextResponse.json({ error: 'Failed to update block' }, { status: 500 });
    }

    return NextResponse.json(updated);
  } catch (err) {
    console.error('PATCH practitioner-calendar-blocks failed:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/** DELETE — remove a block. */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const supabase = await createClient();
    const staff = await getVenueStaff(supabase);
    if (!staff) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    }

    const { id } = await params;

    const { error } = await staff.db
      .from('practitioner_calendar_blocks')
      .delete()
      .eq('id', id)
      .eq('venue_id', staff.venue_id);

    if (error) {
      console.error('DELETE practitioner-calendar-blocks:', error);
      return NextResponse.json({ error: 'Failed to delete block' }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('DELETE practitioner-calendar-blocks failed:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
