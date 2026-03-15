import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getVenueStaff, requireAdmin } from '@/lib/venue-auth';
import { BOOKING_ACTIVE_STATUSES } from '@/lib/table-management/constants';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

const tableSchema = z.object({
  name: z.string().min(1).max(50),
  min_covers: z.number().int().min(1).max(50).default(1),
  max_covers: z.number().int().min(1).max(50).default(2),
  shape: z.enum(['rectangle', 'circle', 'square', 'oval', 'l-shape']).default('rectangle'),
  zone: z.string().max(100).nullable().optional(),
  position_x: z.number().nullable().optional(),
  position_y: z.number().nullable().optional(),
  width: z.number().nullable().optional(),
  height: z.number().nullable().optional(),
  rotation: z.number().nullable().optional(),
  sort_order: z.number().int().default(0),
  server_section: z.string().max(100).nullable().optional(),
  is_active: z.boolean().default(true),
});

const batchSchema = z.object({
  tables: z.array(tableSchema).min(1).max(100),
});

const updateSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(50).optional(),
  min_covers: z.number().int().min(1).max(50).optional(),
  max_covers: z.number().int().min(1).max(50).optional(),
  shape: z.enum(['rectangle', 'circle', 'square', 'oval', 'l-shape']).optional(),
  zone: z.string().max(100).nullable().optional(),
  position_x: z.number().nullable().optional(),
  position_y: z.number().nullable().optional(),
  width: z.number().nullable().optional(),
  height: z.number().nullable().optional(),
  rotation: z.number().nullable().optional(),
  sort_order: z.number().int().optional(),
  server_section: z.string().max(100).nullable().optional(),
  is_active: z.boolean().optional(),
  snap_group_id: z.string().uuid().nullable().optional(),
  snap_sides: z.array(z.string()).nullable().optional(),
});

async function hasFutureAssignedBookings(
  db: SupabaseClient,
  tableId: string,
  today: string
): Promise<boolean> {
  const { data: assignmentRows } = await db
    .from('booking_table_assignments')
    .select('booking_id')
    .eq('table_id', tableId);

  const bookingIds = (assignmentRows ?? []).map((row) => row.booking_id);
  if (bookingIds.length === 0) return false;

  const { count } = await db
    .from('bookings')
    .select('id', { count: 'exact', head: true })
    .in('id', bookingIds)
    .gte('booking_date', today)
    .in('status', [...BOOKING_ACTIVE_STATUSES]);

  return (count ?? 0) > 0;
}

export async function GET() {
  const supabase = await createClient();
  const staff = await getVenueStaff(supabase);
  if (!staff) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  const { data: tables, error } = await staff.db
    .from('venue_tables')
    .select('*')
    .eq('venue_id', staff.venue_id)
    .order('sort_order');

  if (error) {
    console.error('GET /api/venue/tables failed:', error);
    return NextResponse.json({ error: 'Failed to load tables' }, { status: 500 });
  }

  const { data: venue } = await staff.db
    .from('venues')
    .select('table_management_enabled, floor_plan_background_url, auto_bussing_minutes, active_table_statuses, no_show_grace_minutes, combination_threshold')
    .eq('id', staff.venue_id)
    .single();

  return NextResponse.json({
    tables: tables ?? [],
    settings: {
      table_management_enabled: venue?.table_management_enabled ?? false,
      floor_plan_background_url: venue?.floor_plan_background_url ?? null,
      auto_bussing_minutes: venue?.auto_bussing_minutes ?? 10,
      active_table_statuses: venue?.active_table_statuses ?? [],
      no_show_grace_minutes: venue?.no_show_grace_minutes ?? 15,
      combination_threshold: venue?.combination_threshold ?? 80,
    },
  });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const staff = await getVenueStaff(supabase);
  if (!requireAdmin(staff)) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  const body = await request.json();

  if (body.tables) {
    const parsed = batchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
    }

    const inserts = parsed.data.tables.map((t, i) => ({
      venue_id: staff.venue_id,
      ...t,
      sort_order: t.sort_order || i,
    }));

    const { data, error } = await staff.db
      .from('venue_tables')
      .insert(inserts)
      .select('*');

    if (error) {
      console.error('Batch insert tables failed:', error);
      return NextResponse.json({ error: 'Failed to create tables' }, { status: 500 });
    }

    return NextResponse.json({ tables: data }, { status: 201 });
  }

  const parsed = tableSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
  }

  const { data, error } = await staff.db
    .from('venue_tables')
    .insert({ venue_id: staff.venue_id, ...parsed.data })
    .select('*')
    .single();

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'A table with this name already exists' }, { status: 409 });
    }
    console.error('Insert table failed:', error);
    return NextResponse.json({ error: 'Failed to create table' }, { status: 500 });
  }

  return NextResponse.json({ table: data }, { status: 201 });
}

export async function PUT(request: NextRequest) {
  const supabase = await createClient();
  const staff = await getVenueStaff(supabase);
  if (!requireAdmin(staff)) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  const body = await request.json();

  if (Array.isArray(body)) {
    const results = [];
    const today = new Date().toISOString().slice(0, 10);
    for (const item of body) {
      const parsed = updateSchema.safeParse(item);
      if (!parsed.success) continue;

      const { id, ...updates } = parsed.data;
      if (updates.is_active === false) {
        const hasFutureBookings = await hasFutureAssignedBookings(staff.db, id, today);
        if (hasFutureBookings) {
          return NextResponse.json(
            { error: `Cannot deactivate table ${id} while it has future assigned bookings. Reassign those bookings first.` },
            { status: 409 }
          );
        }
      }
      const { data, error } = await staff.db
        .from('venue_tables')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('venue_id', staff.venue_id)
        .select('*')
        .single();

      if (!error && data) results.push(data);
    }
    return NextResponse.json({ tables: results });
  }

  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
  }

  const { id, ...updates } = parsed.data;
  if (updates.is_active === false) {
    const today = new Date().toISOString().slice(0, 10);
    const hasFutureBookings = await hasFutureAssignedBookings(staff.db, id, today);
    if (hasFutureBookings) {
      return NextResponse.json(
        { error: 'Cannot deactivate this table while it has future assigned bookings. Reassign those bookings first.' },
        { status: 409 }
      );
    }
  }
  const { data, error } = await staff.db
    .from('venue_tables')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('venue_id', staff.venue_id)
    .select('*')
    .single();

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'A table with this name already exists' }, { status: 409 });
    }
    console.error('Update table failed:', error);
    return NextResponse.json({ error: 'Failed to update table' }, { status: 500 });
  }

  return NextResponse.json({ table: data });
}

export async function DELETE(request: NextRequest) {
  const supabase = await createClient();
  const staff = await getVenueStaff(supabase);
  if (!requireAdmin(staff)) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) {
    return NextResponse.json({ error: 'Missing table id' }, { status: 400 });
  }

  const today = new Date().toISOString().slice(0, 10);
  const hasFutureBookings = await hasFutureAssignedBookings(staff.db, id, today);
  if (hasFutureBookings) {
    return NextResponse.json(
      { error: 'Cannot delete this table while it has future assigned bookings. Reassign those bookings first.' },
      { status: 409 }
    );
  }

  const { error } = await staff.db
    .from('venue_tables')
    .delete()
    .eq('id', id)
    .eq('venue_id', staff.venue_id);

  if (error) {
    console.error('Delete table failed:', error);
    return NextResponse.json({ error: 'Failed to delete table' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
