import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getVenueStaff, requireAdmin } from '@/lib/venue-auth';
import { z } from 'zod';

const positionUpdateSchema = z.object({
  table_id: z.string().uuid(),
  position_x: z.number().nullable().optional(),
  position_y: z.number().nullable().optional(),
  width: z.number().nullable().optional(),
  height: z.number().nullable().optional(),
  rotation: z.number().optional(),
  seat_angles: z.array(z.number().nullable()).nullable().optional(),
  polygon_points: z.array(z.object({ x: z.number(), y: z.number() })).nullable().optional(),
});

/**
 * GET /api/venue/floor-plans/[id]/positions
 * Returns all table positions for the given floor plan.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const supabase = await createClient();
    const staff = await getVenueStaff(supabase);
    if (!staff) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

    const { id } = await params;

    // Verify the floor plan belongs to this venue
    const { data: fp } = await staff.db
      .from('floor_plans')
      .select('id')
      .eq('id', id)
      .eq('venue_id', staff.venue_id)
      .single();

    if (!fp) return NextResponse.json({ error: 'Floor plan not found' }, { status: 404 });

    const { data: positions, error } = await staff.db
      .from('floor_plan_table_positions')
      .select('*')
      .eq('floor_plan_id', id);

    if (error) {
      console.error('GET positions failed:', error);
      return NextResponse.json({ error: 'Failed to load positions' }, { status: 500 });
    }

    return NextResponse.json({ positions: positions ?? [] });
  } catch (err) {
    console.error('GET /api/venue/floor-plans/[id]/positions error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * PUT /api/venue/floor-plans/[id]/positions
 * Upsert table positions for the given floor plan (admin only).
 * Body: array of position update objects.
 */
export async function PUT(
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

    // Verify the floor plan belongs to this venue
    const { data: fp } = await staff.db
      .from('floor_plans')
      .select('id')
      .eq('id', id)
      .eq('venue_id', staff.venue_id)
      .single();

    if (!fp) return NextResponse.json({ error: 'Floor plan not found' }, { status: 404 });

    const body = await request.json();
    const items: unknown[] = Array.isArray(body) ? body : [body];

    const upserts = [];
    for (const item of items) {
      const parsed = positionUpdateSchema.safeParse(item);
      if (!parsed.success) continue;
      upserts.push({
        floor_plan_id: id,
        ...parsed.data,
        updated_at: new Date().toISOString(),
      });
    }

    if (upserts.length === 0) {
      return NextResponse.json({ positions: [] });
    }

    const { data, error } = await staff.db
      .from('floor_plan_table_positions')
      .upsert(upserts, { onConflict: 'floor_plan_id,table_id' })
      .select('*');

    if (error) {
      console.error('PUT positions failed:', error);
      return NextResponse.json({ error: 'Failed to save positions' }, { status: 500 });
    }

    return NextResponse.json({ positions: data ?? [] });
  } catch (err) {
    console.error('PUT /api/venue/floor-plans/[id]/positions error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
