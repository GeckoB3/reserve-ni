import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { getVenueStaff } from '@/lib/venue-auth';

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
  if (updates.start_at && updates.end_at && new Date(updates.end_at) <= new Date(updates.start_at)) {
    return NextResponse.json({ error: 'End time must be after start time' }, { status: 400 });
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
