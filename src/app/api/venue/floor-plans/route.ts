import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getVenueStaff, requireAdmin } from '@/lib/venue-auth';
import { z } from 'zod';
import { ensureDefaultDiningAreaForVenue } from '@/lib/areas/resolve-default-area';
import { getSupabaseAdminClient } from '@/lib/supabase';

const MAX_FLOOR_PLANS = 24;

const createSchema = z.object({
  name: z.string().min(1).max(100).trim(),
  background_url: z.string().url().nullable().optional(),
  sort_order: z.number().int().optional(),
  copy_from_id: z.string().uuid().optional(),
  area_id: z.string().uuid().optional(),
});

/** GET /api/venue/floor-plans — list floor plans; optional `area_id` filters by dining area. */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const staff = await getVenueStaff(supabase);
    if (!staff) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

    const areaId = request.nextUrl.searchParams.get('area_id');

    let fpQuery = staff.db
      .from('floor_plans')
      .select('id, name, background_url, sort_order, canvas_width, canvas_height, created_at, updated_at')
      .eq('venue_id', staff.venue_id);
    if (areaId) {
      fpQuery = fpQuery.eq('area_id', areaId);
    }
    const { data: floorPlans, error } = await fpQuery.order('sort_order').order('created_at');

    if (error) {
      console.error('GET /api/venue/floor-plans failed:', error);
      return NextResponse.json({ error: 'Failed to load floor plans' }, { status: 500 });
    }

    return NextResponse.json({ floor_plans: floorPlans ?? [] });
  } catch (err) {
    console.error('GET /api/venue/floor-plans error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/** POST /api/venue/floor-plans — create a new floor plan (admin only). */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const staff = await getVenueStaff(supabase);
    if (!requireAdmin(staff)) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const body = await request.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
    }

    // Enforce 24-plan limit
    const { count } = await staff.db
      .from('floor_plans')
      .select('id', { count: 'exact', head: true })
      .eq('venue_id', staff.venue_id);

    if ((count ?? 0) >= MAX_FLOOR_PLANS) {
      return NextResponse.json(
        { error: `Maximum of ${MAX_FLOOR_PLANS} floor plans reached` },
        { status: 422 },
      );
    }

    const { copy_from_id, area_id: bodyAreaId, ...fields } = parsed.data;

    const admin = getSupabaseAdminClient();
    const areaId = bodyAreaId ?? (await ensureDefaultDiningAreaForVenue(admin, staff.venue_id));
    if (!areaId) {
      return NextResponse.json({ error: 'No dining area configured for this venue' }, { status: 400 });
    }

    // Create the floor plan record
    const { data: newPlan, error: insertError } = await staff.db
      .from('floor_plans')
      .insert({
        venue_id: staff.venue_id,
        area_id: areaId,
        name: fields.name,
        background_url: fields.background_url ?? null,
        sort_order: fields.sort_order ?? (count ?? 0),
      })
      .select('id, name, background_url, sort_order, canvas_width, canvas_height, created_at, updated_at')
      .single();

    if (insertError) {
      console.error('Insert floor plan failed:', insertError);
      return NextResponse.json({ error: 'Failed to create floor plan' }, { status: 500 });
    }

    // If copying, duplicate positions from the source floor plan
    if (copy_from_id) {
      const { data: sourcePositions } = await staff.db
        .from('floor_plan_table_positions')
        .select('table_id, position_x, position_y, width, height, rotation, seat_angles, polygon_points')
        .eq('floor_plan_id', copy_from_id);

      if (sourcePositions && sourcePositions.length > 0) {
        const copies = sourcePositions.map((p) => ({
          ...p,
          floor_plan_id: newPlan.id,
        }));
        await staff.db.from('floor_plan_table_positions').insert(copies);
      }

      // Also copy background and explicit canvas size if not provided
      if (!fields.background_url) {
        const { data: sourcePlan } = await staff.db
          .from('floor_plans')
          .select('background_url, canvas_width, canvas_height')
          .eq('id', copy_from_id)
          .single();

        if (sourcePlan?.background_url || sourcePlan?.canvas_width || sourcePlan?.canvas_height) {
          await staff.db
            .from('floor_plans')
            .update({
              background_url: sourcePlan?.background_url ?? null,
              canvas_width: sourcePlan?.canvas_width ?? null,
              canvas_height: sourcePlan?.canvas_height ?? null,
            })
            .eq('id', newPlan.id);
          newPlan.background_url = sourcePlan?.background_url ?? null;
          newPlan.canvas_width = sourcePlan?.canvas_width ?? null;
          newPlan.canvas_height = sourcePlan?.canvas_height ?? null;
        }
      }
    }

    return NextResponse.json({ floor_plan: newPlan }, { status: 201 });
  } catch (err) {
    console.error('POST /api/venue/floor-plans error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
