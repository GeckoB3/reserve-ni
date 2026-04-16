import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getVenueStaff, requireAdmin } from '@/lib/venue-auth';
import { validateTablesBelongToVenue } from '@/lib/table-management/lifecycle';
import { tableGroupKeyFromIds } from '@/lib/table-management/combination-rules';
import { z } from 'zod';

const comboSchema = z.object({
  name: z.string().min(1).max(100),
  combined_min_covers: z.number().int().min(1),
  combined_max_covers: z.number().int().min(1),
  table_ids: z.array(z.string().uuid()).min(2),
  days_of_week: z.array(z.number().int().min(1).max(7)).min(1).optional(),
  time_start: z.string().nullable().optional(),
  time_end: z.string().nullable().optional(),
  booking_type_filters: z.array(z.string()).nullable().optional(),
  requires_manager_approval: z.boolean().optional(),
  internal_notes: z.string().max(2000).nullable().optional(),
});

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const staff = await getVenueStaff(supabase);
  if (!staff) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  const areaId = request.nextUrl.searchParams.get('area_id');

  let comboQuery = staff.db
    .from('table_combinations')
    .select('*, members:table_combination_members(id, table_id, table:venue_tables(id, name, max_covers))')
    .eq('venue_id', staff.venue_id);
  if (areaId) {
    comboQuery = comboQuery.eq('area_id', areaId);
  }
  const { data, error } = await comboQuery.order('created_at');

  if (error) {
    console.error('GET /api/venue/tables/combinations failed:', error);
    return NextResponse.json({ error: 'Failed to load combinations' }, { status: 500 });
  }

  return NextResponse.json({ combinations: data ?? [] });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const staff = await getVenueStaff(supabase);
  if (!requireAdmin(staff)) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  const body = await request.json();
  const parsed = comboSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
  }

  const { table_ids, ...comboData } = parsed.data;

  const tablesValid = await validateTablesBelongToVenue(staff.db, staff.venue_id, table_ids);
  if (!tablesValid) {
    return NextResponse.json({ error: 'One or more tables do not belong to this venue' }, { status: 400 });
  }

  const { data: firstTable } = await staff.db
    .from('venue_tables')
    .select('area_id')
    .eq('id', table_ids[0]!)
    .eq('venue_id', staff.venue_id)
    .maybeSingle();
  const combinationAreaId = firstTable?.area_id as string | undefined;
  if (!combinationAreaId) {
    return NextResponse.json({ error: 'Could not resolve dining area for these tables' }, { status: 400 });
  }

  const table_group_key = tableGroupKeyFromIds(table_ids);
  const { data: dup } = await staff.db
    .from('table_combinations')
    .select('id')
    .eq('venue_id', staff.venue_id)
    .eq('area_id', combinationAreaId)
    .eq('table_group_key', table_group_key)
    .maybeSingle();
  if (dup) {
    return NextResponse.json(
      { error: 'A combination with this set of tables already exists. Edit the existing combination instead.' },
      { status: 409 },
    );
  }

  const { data: combo, error: comboErr } = await staff.db
    .from('table_combinations')
    .insert({
      venue_id: staff.venue_id,
      area_id: combinationAreaId,
      table_group_key,
      ...comboData,
      requires_manager_approval: comboData.requires_manager_approval ?? false,
    })
    .select('*')
    .single();

  if (comboErr) {
    console.error('Insert combination failed:', comboErr);
    return NextResponse.json({ error: 'Failed to create combination' }, { status: 500 });
  }

  const members = table_ids.map((tid) => ({
    combination_id: combo.id,
    table_id: tid,
  }));

  const { error: memberErr } = await staff.db
    .from('table_combination_members')
    .insert(members);

  if (memberErr) {
    console.error('Insert combination members failed:', memberErr);
    await staff.db.from('table_combinations').delete().eq('id', combo.id);
    return NextResponse.json({ error: 'Failed to create combination members' }, { status: 500 });
  }

  return NextResponse.json({ combination: combo }, { status: 201 });
}

const patchSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  combined_min_covers: z.number().int().min(1).optional(),
  combined_max_covers: z.number().int().min(1).optional(),
  table_ids: z.array(z.string().uuid()).min(2).optional(),
  is_active: z.boolean().optional(),
  days_of_week: z.array(z.number().int().min(1).max(7)).min(1).optional(),
  time_start: z.string().nullable().optional(),
  time_end: z.string().nullable().optional(),
  booking_type_filters: z.array(z.string()).nullable().optional(),
  requires_manager_approval: z.boolean().optional(),
  internal_notes: z.string().max(2000).nullable().optional(),
});

export async function PATCH(request: NextRequest) {
  const supabase = await createClient();
  const staff = await getVenueStaff(supabase);
  if (!requireAdmin(staff)) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  const id = new URL(request.url).searchParams.get('id');
  if (!id) {
    return NextResponse.json({ error: 'Missing combination id' }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
  }

  const { table_ids, ...rest } = parsed.data;
  const updates: Record<string, unknown> = { ...rest };
  if (table_ids) {
    const tablesValid = await validateTablesBelongToVenue(staff.db, staff.venue_id, table_ids);
    if (!tablesValid) {
      return NextResponse.json({ error: 'One or more tables do not belong to this venue' }, { status: 400 });
    }
    const newKey = tableGroupKeyFromIds(table_ids);
    const { data: other } = await staff.db
      .from('table_combinations')
      .select('id')
      .eq('venue_id', staff.venue_id)
      .eq('table_group_key', newKey)
      .neq('id', id)
      .maybeSingle();
    if (other) {
      return NextResponse.json(
        { error: 'Another combination already uses this set of tables.' },
        { status: 409 },
      );
    }

    await staff.db.from('table_combination_members').delete().eq('combination_id', id);
    const members = table_ids.map((tid) => ({ combination_id: id, table_id: tid }));
    const { error: memErr } = await staff.db.from('table_combination_members').insert(members);
    if (memErr) {
      console.error('PATCH combination members:', memErr);
      return NextResponse.json({ error: 'Failed to update combination members' }, { status: 500 });
    }

    updates.table_group_key = newKey;
  }

  updates.updated_at = new Date().toISOString();

  const { data, error } = await staff.db
    .from('table_combinations')
    .update(updates)
    .eq('id', id)
    .eq('venue_id', staff.venue_id)
    .select('*')
    .single();

  if (error) {
    console.error('PATCH table_combinations:', error);
    return NextResponse.json({ error: 'Failed to update combination' }, { status: 500 });
  }

  return NextResponse.json({ combination: data });
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
    return NextResponse.json({ error: 'Missing combination id' }, { status: 400 });
  }

  const { error } = await staff.db
    .from('table_combinations')
    .delete()
    .eq('id', id)
    .eq('venue_id', staff.venue_id);

  if (error) {
    console.error('Delete combination failed:', error);
    return NextResponse.json({ error: 'Failed to delete combination' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
