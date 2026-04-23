import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseAdminClient } from '@/lib/supabase';
import { planCalendarLimit, planStaffLimit } from '@/lib/plan-limits';

export function lightPlanCalendarLimit(): number {
  return planCalendarLimit('light');
}

/**
 * Active bookable calendar columns for the venue (`unified_calendars`).
 */
export async function countUnifiedCalendarColumns(
  admin: SupabaseClient,
  venueId: string,
): Promise<number> {
  const { count, error } = await admin
    .from('unified_calendars')
    .select('id', { count: 'exact', head: true })
    .eq('venue_id', venueId)
    .eq('is_active', true);

  if (error) {
    console.error('[countUnifiedCalendarColumns]', error.message, { venueId });
    return 0;
  }
  return count ?? 0;
}

/**
 * Enforces per-tier active `unified_calendars` cap (Light: 1, Plus: 5, else unlimited).
 */
export async function assertCalendarSlotAvailable(venueId: string): Promise<{
  allowed: boolean;
  current: number;
  limit: number;
}> {
  const admin = getSupabaseAdminClient();
  const { data: venue } = await admin
    .from('venues')
    .select('pricing_tier')
    .eq('id', venueId)
    .maybeSingle();

  const tier = (venue as { pricing_tier?: string | null } | null)?.pricing_tier;
  const limit = planCalendarLimit(tier);
  if (limit === Infinity) {
    return { allowed: true, current: 0, limit: Infinity };
  }

  const current = await countUnifiedCalendarColumns(admin, venueId);
  return {
    allowed: current < limit,
    current,
    limit,
  };
}

/** @deprecated Use assertCalendarSlotAvailable */
export async function assertLightPlanCalendarSlotAvailable(venueId: string) {
  return assertCalendarSlotAvailable(venueId);
}

/**
 * Before adding a staff row: enforce per-tier staff cap (Light: 1, Plus: 5, else unlimited).
 * For Light, invite is blocked once there is already one staff (owner).
 */
export async function assertStaffSlotAvailable(venueId: string): Promise<{
  allowed: boolean;
  staffCount: number;
  limit: number;
}> {
  const admin = getSupabaseAdminClient();
  const { data: venue } = await admin
    .from('venues')
    .select('pricing_tier')
    .eq('id', venueId)
    .maybeSingle();

  const tier = (venue as { pricing_tier?: string | null } | null)?.pricing_tier;
  const limit = planStaffLimit(tier);

  const { count, error } = await admin
    .from('staff')
    .select('id', { count: 'exact', head: true })
    .eq('venue_id', venueId);

  if (error) {
    console.error('[assertStaffSlotAvailable]', error.message, { venueId });
    return { allowed: false, staffCount: 999, limit };
  }

  const staffCount = count ?? 0;
  if (limit === Infinity) {
    return { allowed: true, staffCount, limit };
  }
  return { allowed: staffCount < limit, staffCount, limit };
}

/** @deprecated Use assertStaffSlotAvailable */
export async function assertLightPlanSingleStaffOnly(venueId: string) {
  const r = await assertStaffSlotAvailable(venueId);
  return { allowed: r.allowed, staffCount: r.staffCount };
}
