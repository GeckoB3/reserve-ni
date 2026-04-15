import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getVenueStaff, requireAdmin } from '@/lib/venue-auth';
import { z } from 'zod';

const patchSchema = z.object({
  name: z.string().min(1).max(100).trim().optional(),
  background_url: z.string().url().nullable().optional(),
  sort_order: z.number().int().optional(),
  canvas_width: z.number().positive().nullable().optional(),
  canvas_height: z.number().positive().nullable().optional(),
});

/** PATCH /api/venue/floor-plans/[id] — rename or reorder a floor plan (admin only). */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const supabase = await createClient();
    const staff = await getVenueStaff(supabase);
    if (!requireAdmin(staff)) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { id } = await params;

    const body = await request.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
    }

    const { data, error } = await staff.db
      .from('floor_plans')
      .update({ ...parsed.data, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('venue_id', staff.venue_id)
      .select('id, name, background_url, sort_order, canvas_width, canvas_height, created_at, updated_at')
      .single();

    if (error) {
      console.error('PATCH /api/venue/floor-plans/[id] failed:', error);
      return NextResponse.json({ error: 'Failed to update floor plan' }, { status: 500 });
    }

    return NextResponse.json({ floor_plan: data });
  } catch (err) {
    console.error('PATCH /api/venue/floor-plans/[id] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/** DELETE /api/venue/floor-plans/[id] — delete a floor plan (admin only). */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const supabase = await createClient();
    const staff = await getVenueStaff(supabase);
    if (!requireAdmin(staff)) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { id } = await params;

    // Check at least one floor plan would remain after deletion
    const { count } = await staff.db
      .from('floor_plans')
      .select('id', { count: 'exact', head: true })
      .eq('venue_id', staff.venue_id);

    if ((count ?? 0) <= 1) {
      return NextResponse.json(
        { error: 'Cannot delete the last floor plan. Rename it instead.' },
        { status: 422 },
      );
    }

    const { error } = await staff.db
      .from('floor_plans')
      .delete()
      .eq('id', id)
      .eq('venue_id', staff.venue_id);

    if (error) {
      console.error('DELETE /api/venue/floor-plans/[id] failed:', error);
      return NextResponse.json({ error: 'Failed to delete floor plan' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/venue/floor-plans/[id] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
