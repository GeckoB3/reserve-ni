import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getVenueStaff, requireAdmin } from '@/lib/venue-auth';
import { z } from 'zod';

const bodySchema = z.object({
  table_group_key: z.string().min(1),
  disabled: z.boolean().optional(),
  display_name: z.string().max(200).nullable().optional(),
  combined_min_covers: z.number().int().min(1).nullable().optional(),
  combined_max_covers: z.number().int().min(1).nullable().optional(),
  days_of_week: z.array(z.number().int().min(1).max(7)).min(1).optional(),
  time_start: z.string().nullable().optional(),
  time_end: z.string().nullable().optional(),
  booking_type_filters: z.array(z.string()).nullable().optional(),
  requires_manager_approval: z.boolean().optional(),
  internal_notes: z.string().max(2000).nullable().optional(),
});

/** POST — create or replace override for an auto-detected group key */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const staff = await getVenueStaff(supabase);
  if (!requireAdmin(staff)) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
  }

  const row = {
    venue_id: staff!.venue_id,
    ...parsed.data,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await staff!.db
    .from('combination_auto_overrides')
    .upsert(row, { onConflict: 'venue_id,table_group_key' })
    .select('*')
    .single();

  if (error) {
    console.error('Upsert combination_auto_overrides:', error);
    return NextResponse.json({ error: 'Failed to save override' }, { status: 500 });
  }

  return NextResponse.json({ override: data }, { status: 201 });
}

/** PATCH — update by id */
export async function PATCH(request: NextRequest) {
  const supabase = await createClient();
  const staff = await getVenueStaff(supabase);
  if (!requireAdmin(staff)) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  const id = new URL(request.url).searchParams.get('id');
  if (!id) {
    return NextResponse.json({ error: 'Missing id' }, { status: 400 });
  }

  const patchSchema = bodySchema.partial().extend({ table_group_key: z.string().optional() });
  const parsed = patchSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
  }

  const { data, error } = await staff!.db
    .from('combination_auto_overrides')
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('venue_id', staff.venue_id)
    .select('*')
    .single();

  if (error) {
    console.error('PATCH combination_auto_overrides:', error);
    return NextResponse.json({ error: 'Failed to update override' }, { status: 500 });
  }

  return NextResponse.json({ override: data });
}

/** DELETE — by id */
export async function DELETE(request: NextRequest) {
  const supabase = await createClient();
  const staff = await getVenueStaff(supabase);
  if (!requireAdmin(staff)) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  const id = new URL(request.url).searchParams.get('id');
  if (!id) {
    return NextResponse.json({ error: 'Missing id' }, { status: 400 });
  }

  const { error } = await staff!.db
    .from('combination_auto_overrides')
    .delete()
    .eq('id', id)
    .eq('venue_id', staff.venue_id);

  if (error) {
    console.error('DELETE combination_auto_overrides:', error);
    return NextResponse.json({ error: 'Failed to delete override' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
