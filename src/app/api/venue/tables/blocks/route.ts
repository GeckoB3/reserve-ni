import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { getVenueStaff } from '@/lib/venue-auth';

const BOOKING_STATUSES_BLOCK_CONFLICTS = ['Pending', 'Confirmed', 'Seated'] as const;

function bookingWindowMs(
  bookingDate: string,
  bookingTime: string | null,
  estimatedEnd: string | null,
): { start: number; end: number } | null {
  if (!bookingTime) return null;
  const t = bookingTime.slice(0, 5);
  const start = Date.parse(`${bookingDate}T${t}:00.000Z`);
  if (Number.isNaN(start)) return null;
  let end: number;
  if (estimatedEnd && String(estimatedEnd).includes('T')) {
    end = Date.parse(String(estimatedEnd));
  } else if (estimatedEnd) {
    end = Date.parse(`${bookingDate}T${String(estimatedEnd).slice(0, 5)}:00.000Z`);
  } else {
    end = start + 90 * 60 * 1000;
  }
  if (Number.isNaN(end)) end = start + 90 * 60 * 1000;
  return { start, end };
}

function intervalsOverlap(a0: number, a1: number, b0: number, b1: number): boolean {
  return a0 < b1 && a1 > b0;
}

type GuestEmbed = { name: string | null };

type BookingEmbed = {
  booking_date: string | null;
  booking_time: string | null;
  estimated_end_time: string | null;
  status: string | null;
  venue_id: string | null;
  guest: GuestEmbed | GuestEmbed[] | null;
};

type AssignmentRow = {
  booking_id: string;
  bookings: BookingEmbed | BookingEmbed[] | null;
};

function guestNameFromBookingEmbed(b: BookingEmbed): string {
  const g = b.guest;
  const guest = Array.isArray(g) ? g[0] : g;
  return guest?.name?.trim() || 'Guest';
}

/**
 * Returns an error message if the block window overlaps any active booking on this table.
 */
async function getTableBlockBookingConflict(
  db: SupabaseClient,
  venueId: string,
  tableId: string,
  blockStartMs: number,
  blockEndMs: number,
): Promise<string | null> {
  const { data: rows, error } = await db
    .from('booking_table_assignments')
    .select(
      'booking_id, bookings!inner(booking_date, booking_time, estimated_end_time, status, venue_id, guest:guests(name))',
    )
    .eq('table_id', tableId)
    .eq('bookings.venue_id', venueId);

  if (error) {
    console.error('[table blocks] conflict lookup failed:', error);
    return 'Could not verify bookings for this table';
  }

  for (const row of (rows ?? []) as unknown as AssignmentRow[]) {
    const b = Array.isArray(row.bookings) ? row.bookings[0] : row.bookings;
    if (!b?.booking_date || !b.booking_time || !b.status) continue;
    if (!BOOKING_STATUSES_BLOCK_CONFLICTS.includes(b.status as (typeof BOOKING_STATUSES_BLOCK_CONFLICTS)[number])) {
      continue;
    }
    const win = bookingWindowMs(b.booking_date, b.booking_time, b.estimated_end_time);
    if (!win) continue;
    if (intervalsOverlap(blockStartMs, blockEndMs, win.start, win.end)) {
      const name = guestNameFromBookingEmbed(b);
      const time = b.booking_time.slice(0, 5);
      return `This block would overlap a booking (${name} at ${time}). Remove or reschedule the booking first, or choose a different time.`;
    }
  }

  return null;
}

const blockCreateSchema = z.object({
  table_id: z.string().uuid(),
  start_at: z.string().datetime(),
  end_at: z.string().datetime(),
  reason: z.string().max(300).optional().nullable(),
  repeat: z.enum(['none', 'week']).optional(),
});

const blockUpdateSchema = z.object({
  id: z.string().uuid(),
  start_at: z.string().datetime().optional(),
  end_at: z.string().datetime().optional(),
  reason: z.string().max(300).optional().nullable(),
});

const blockDeleteSchema = z.object({
  id: z.string().uuid(),
});

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const staff = await getVenueStaff(supabase);
  if (!staff) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  const date = request.nextUrl.searchParams.get('date');
  const query = staff.db
    .from('table_blocks')
    .select('*')
    .eq('venue_id', staff.venue_id)
    .order('start_at', { ascending: true });

  if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const dayStart = `${date}T00:00:00.000Z`;
    const dayEnd = `${date}T23:59:59.999Z`;
    query.lt('start_at', dayEnd).gt('end_at', dayStart);
  }

  const { data, error } = await query;
  if (error) {
    console.error('GET /api/venue/tables/blocks failed:', error);
    return NextResponse.json({ error: 'Failed to load table blocks' }, { status: 500 });
  }

  return NextResponse.json({ blocks: data ?? [] });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const staff = await getVenueStaff(supabase);
  if (!staff) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  const body = await request.json();
  const parsed = blockCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
  }

  const { table_id, start_at, end_at, reason, repeat } = parsed.data;
  if (new Date(end_at) <= new Date(start_at)) {
    return NextResponse.json({ error: 'End time must be after start time' }, { status: 400 });
  }

  const { data: table } = await staff.db
    .from('venue_tables')
    .select('id')
    .eq('id', table_id)
    .eq('venue_id', staff.venue_id)
    .single();
  if (!table) return NextResponse.json({ error: 'Table not found' }, { status: 404 });

  const startDate = new Date(start_at);
  const endDate = new Date(end_at);
  const records = [{
    venue_id: staff.venue_id,
    table_id,
    start_at,
    end_at,
    reason: reason ?? null,
    created_by: staff.id,
  }];
  if (repeat === 'week') {
    const weekday = startDate.getUTCDay();
    const daysToEndOfWeek = Math.max(0, 6 - weekday);
    for (let i = 1; i <= daysToEndOfWeek; i += 1) {
      const nextStart = new Date(startDate);
      const nextEnd = new Date(endDate);
      nextStart.setUTCDate(nextStart.getUTCDate() + i);
      nextEnd.setUTCDate(nextEnd.getUTCDate() + i);
      records.push({
        venue_id: staff.venue_id,
        table_id,
        start_at: nextStart.toISOString(),
        end_at: nextEnd.toISOString(),
        reason: reason ?? null,
        created_by: staff.id,
      });
    }
  }

  for (const rec of records) {
    const s = Date.parse(rec.start_at);
    const e = Date.parse(rec.end_at);
    const conflict = await getTableBlockBookingConflict(staff.db, staff.venue_id, table_id, s, e);
    if (conflict) {
      return NextResponse.json({ error: conflict }, { status: 409 });
    }
  }

  const { data, error } = await staff.db
    .from('table_blocks')
    .insert(records)
    .select('*');

  if (error) {
    console.error('POST /api/venue/tables/blocks failed:', error);
    return NextResponse.json({ error: 'Failed to create table block' }, { status: 500 });
  }

  return NextResponse.json({ blocks: data ?? [] }, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const supabase = await createClient();
  const staff = await getVenueStaff(supabase);
  if (!staff) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  const body = await request.json();
  const parsed = blockUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
  }

  const { id, ...updates } = parsed.data;

  const { data: existing, error: loadErr } = await staff.db
    .from('table_blocks')
    .select('table_id, start_at, end_at')
    .eq('id', id)
    .eq('venue_id', staff.venue_id)
    .single();
  if (loadErr || !existing) {
    return NextResponse.json({ error: 'Block not found' }, { status: 404 });
  }

  const nextStart = updates.start_at ?? existing.start_at;
  const nextEnd = updates.end_at ?? existing.end_at;
  if (new Date(nextEnd) <= new Date(nextStart)) {
    return NextResponse.json({ error: 'End time must be after start time' }, { status: 400 });
  }

  const s = Date.parse(nextStart);
  const e = Date.parse(nextEnd);
  const conflict = await getTableBlockBookingConflict(
    staff.db,
    staff.venue_id,
    existing.table_id as string,
    s,
    e,
  );
  if (conflict) {
    return NextResponse.json({ error: conflict }, { status: 409 });
  }

  const { data, error } = await staff.db
    .from('table_blocks')
    .update(updates)
    .eq('id', id)
    .eq('venue_id', staff.venue_id)
    .select('*')
    .single();

  if (error) {
    console.error('PATCH /api/venue/tables/blocks failed:', error);
    return NextResponse.json({ error: 'Failed to update table block' }, { status: 500 });
  }

  return NextResponse.json({ block: data });
}

export async function DELETE(request: NextRequest) {
  const supabase = await createClient();
  const staff = await getVenueStaff(supabase);
  if (!staff) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  const body = await request.json();
  const parsed = blockDeleteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
  }

  const { error } = await staff.db
    .from('table_blocks')
    .delete()
    .eq('id', parsed.data.id)
    .eq('venue_id', staff.venue_id);

  if (error) {
    console.error('DELETE /api/venue/tables/blocks failed:', error);
    return NextResponse.json({ error: 'Failed to delete table block' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
