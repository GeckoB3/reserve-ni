import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getVenueStaff, requireAdmin } from '@/lib/venue-auth';
import { BOOKING_ACTIVE_STATUSES } from '@/lib/table-management/constants';
import { seedDefaultFloorPlanLayoutIfNeeded } from '@/lib/table-management/seed-default-floor-plan';
import { isRestaurantTableProductTier } from '@/lib/tier-enforcement';
import { z } from 'zod';

const settingsSchema = z.object({
  table_management_enabled: z.boolean().optional(),
  floor_plan_background_url: z.string().url().nullable().optional(),
  auto_bussing_minutes: z.number().int().min(0).max(60).optional(),
  active_table_statuses: z.array(z.string()).optional(),
  combination_threshold: z.number().int().min(20).max(300).optional(),
});

/**
 * GET /api/venue/tables/settings - table-management settings plus safety flags.
 */
export async function GET() {
  const supabase = await createClient();
  const staff = await getVenueStaff(supabase);
  if (!staff) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  }

  const { data: settings } = await staff.db
    .from('venues')
    .select('table_management_enabled, floor_plan_background_url, auto_bussing_minutes, active_table_statuses, combination_threshold')
    .eq('id', staff.venue_id)
    .single();

  const { data: tables } = await staff.db
    .from('venue_tables')
    .select('id, position_x, position_y')
    .eq('venue_id', staff.venue_id);

  const hasConfiguredFloorPlan = (tables ?? []).some(
    (table) => table.position_x != null && table.position_y != null
  );

  const today = new Date().toISOString().slice(0, 10);
  const { count: activeAssignmentCount } = await staff.db
    .from('booking_table_assignments')
    .select('booking:bookings!inner(id)', { count: 'exact', head: true })
    .eq('booking.venue_id', staff.venue_id)
    .gte('booking.booking_date', today)
    .in('booking.status', [...BOOKING_ACTIVE_STATUSES]);
  const hasActiveAssignments = (activeAssignmentCount ?? 0) > 0;

  return NextResponse.json({
    settings: {
      table_management_enabled: settings?.table_management_enabled ?? false,
      floor_plan_background_url: settings?.floor_plan_background_url ?? null,
      auto_bussing_minutes: settings?.auto_bussing_minutes ?? 10,
      active_table_statuses: settings?.active_table_statuses ?? [],
      combination_threshold: settings?.combination_threshold ?? 80,
    },
    flags: {
      hasConfiguredFloorPlan,
      hasActiveAssignments,
    },
  });
}

/**
 * PUT /api/venue/tables/settings - update table management settings on venue.
 */
export async function PUT(request: NextRequest) {
  const supabase = await createClient();
  const staff = await getVenueStaff(supabase);
  if (!requireAdmin(staff)) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  const body = await request.json();
  const parsed = settingsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  if (parsed.data.table_management_enabled !== undefined) {
    updates.table_management_enabled = parsed.data.table_management_enabled;
  }
  if (parsed.data.floor_plan_background_url !== undefined) {
    updates.floor_plan_background_url = parsed.data.floor_plan_background_url;
  }
  if (parsed.data.auto_bussing_minutes !== undefined) {
    updates.auto_bussing_minutes = parsed.data.auto_bussing_minutes;
  }
  if (parsed.data.active_table_statuses !== undefined) {
    updates.active_table_statuses = parsed.data.active_table_statuses;
  }
  if (parsed.data.combination_threshold !== undefined) {
    updates.combination_threshold = parsed.data.combination_threshold;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No updates provided' }, { status: 400 });
  }

  let enablingAdvancedFirstTime = false;
  if (parsed.data.table_management_enabled === true) {
    const { data: prior } = await staff.db
      .from('venues')
      .select('table_management_enabled, pricing_tier, booking_model')
      .eq('id', staff.venue_id)
      .single();

    enablingAdvancedFirstTime =
      prior?.table_management_enabled === false &&
      isRestaurantTableProductTier(prior?.pricing_tier as string | undefined) &&
      (prior?.booking_model as string | undefined) === 'table_reservation';

    if (
      enablingAdvancedFirstTime &&
      parsed.data.combination_threshold === undefined &&
      updates.table_management_enabled === true
    ) {
      updates.combination_threshold = 25;
    }
  }

  const { data, error } = await staff.db
    .from('venues')
    .update(updates)
    .eq('id', staff.venue_id)
    .select('table_management_enabled, floor_plan_background_url, auto_bussing_minutes, active_table_statuses, combination_threshold')
    .single();

  if (error) {
    console.error('Update table settings failed:', error);
    return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 });
  }

  let default_floor_plan_seeded = false;
  if (enablingAdvancedFirstTime && data?.table_management_enabled) {
    const seedResult = await seedDefaultFloorPlanLayoutIfNeeded(staff.db, staff.venue_id);
    default_floor_plan_seeded = seedResult.seeded;
  }

  return NextResponse.json({ settings: data, default_floor_plan_seeded });
}
