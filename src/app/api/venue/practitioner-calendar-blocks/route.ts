import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getVenueStaff } from '@/lib/venue-auth';
import { z } from 'zod';

const isoDate = /^\d{4}-\d{2}-\d{2}$/;
const hm = /^([01]?\d|2[0-3]):[0-5]\d$/;

const createSchema = z.object({
  practitioner_id: z.string().uuid(),
  block_date: z.string().regex(isoDate),
  start_time: z.string().regex(hm),
  end_time: z.string().regex(hm),
  reason: z.string().max(200).optional(),
});

function toPgTime(s: string): string {
  return s.length === 5 ? `${s}:00` : s;
}

/** GET — list blocks for date=YYYY-MM-DD or from & to (inclusive). */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const staff = await getVenueStaff(supabase);
    if (!staff) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    }

    const date = request.nextUrl.searchParams.get('date');
    const from = request.nextUrl.searchParams.get('from');
    const to = request.nextUrl.searchParams.get('to');

    let q = staff.db
      .from('practitioner_calendar_blocks')
      .select('id, practitioner_id, block_date, start_time, end_time, reason, created_at')
      .eq('venue_id', staff.venue_id)
      .order('block_date', { ascending: true })
      .order('start_time', { ascending: true });

    if (date && isoDate.test(date)) {
      q = q.eq('block_date', date);
    } else if (from && to && isoDate.test(from) && isoDate.test(to)) {
      q = q.gte('block_date', from).lte('block_date', to);
    } else {
      return NextResponse.json({ error: 'Provide date=YYYY-MM-DD or from=&to=' }, { status: 400 });
    }

    const { data, error } = await q;
    if (error) {
      console.error('GET practitioner-calendar-blocks:', error);
      return NextResponse.json({ error: 'Failed to load blocks' }, { status: 500 });
    }

    const blocks = (data ?? []).map((row: Record<string, unknown>) => ({
      id: row.id,
      practitioner_id: row.practitioner_id,
      block_date: row.block_date,
      start_time: String(row.start_time).slice(0, 5),
      end_time: String(row.end_time).slice(0, 5),
      reason: row.reason ?? null,
      created_at: row.created_at,
    }));

    return NextResponse.json({ blocks });
  } catch (err) {
    console.error('GET practitioner-calendar-blocks failed:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/** POST — create a block. */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const staff = await getVenueStaff(supabase);
    if (!staff) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    }

    const body = await request.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
    }

    const { practitioner_id, block_date, start_time, end_time, reason } = parsed.data;

    const { data: prac, error: pracErr } = await staff.db
      .from('practitioners')
      .select('id')
      .eq('id', practitioner_id)
      .eq('venue_id', staff.venue_id)
      .single();

    if (pracErr || !prac) {
      return NextResponse.json({ error: 'Practitioner not found' }, { status: 400 });
    }

    const { data: inserted, error: insErr } = await staff.db
      .from('practitioner_calendar_blocks')
      .insert({
        venue_id: staff.venue_id,
        practitioner_id,
        block_date,
        start_time: toPgTime(start_time),
        end_time: toPgTime(end_time),
        reason: reason?.trim() || null,
        created_by: staff.id,
      })
      .select('id, practitioner_id, block_date, start_time, end_time, reason, created_at')
      .single();

    if (insErr || !inserted) {
      console.error('POST practitioner-calendar-blocks:', insErr);
      return NextResponse.json({ error: 'Failed to create block' }, { status: 500 });
    }

    return NextResponse.json({
      block: {
        ...inserted,
        start_time: String(inserted.start_time).slice(0, 5),
        end_time: String(inserted.end_time).slice(0, 5),
      },
    });
  } catch (err) {
    console.error('POST practitioner-calendar-blocks failed:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
