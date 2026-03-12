import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getVenueStaff, requireAdmin } from '@/lib/venue-auth';
import { validateTablesBelongToVenue } from '@/lib/table-management/lifecycle';
import { z } from 'zod';

const comboSchema = z.object({
  name: z.string().min(1).max(100),
  combined_min_covers: z.number().int().min(1),
  combined_max_covers: z.number().int().min(1),
  table_ids: z.array(z.string().uuid()).min(2),
});

export async function GET() {
  const supabase = await createClient();
  const staff = await getVenueStaff(supabase);
  if (!staff) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  const { data, error } = await staff.db
    .from('table_combinations')
    .select('*, members:table_combination_members(id, table_id, table:venue_tables(id, name, max_covers))')
    .eq('venue_id', staff.venue_id)
    .order('created_at');

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

  const { data: combo, error: comboErr } = await staff.db
    .from('table_combinations')
    .insert({ venue_id: staff.venue_id, ...comboData })
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
