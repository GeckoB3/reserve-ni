import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseAdminClient } from '@/lib/supabase';

const LIGHT_CALENDAR_LIMIT = 1;

function isLightTier(tier: string | null | undefined): boolean {
  return (tier ?? '').toLowerCase().trim() === 'light';
}

export function lightPlanCalendarLimit(): number {
  return LIGHT_CALENDAR_LIMIT;
}

/**
 * Active bookable calendar columns for the venue (`unified_calendars`).
 * Light plan limits total columns (practitioner, resource, etc.) to one.
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

export async function assertLightPlanCalendarSlotAvailable(venueId: string): Promise<{
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
  if (!isLightTier(tier)) {
    return { allowed: true, current: 0, limit: Infinity };
  }

  const current = await countUnifiedCalendarColumns(admin, venueId);
  return {
    allowed: current < LIGHT_CALENDAR_LIMIT,
    current,
    limit: LIGHT_CALENDAR_LIMIT,
  };
}

export async function assertLightPlanSingleStaffOnly(venueId: string): Promise<{
  allowed: boolean;
  staffCount: number;
}> {
  const admin = getSupabaseAdminClient();
  const { data: venue } = await admin
    .from('venues')
    .select('pricing_tier')
    .eq('id', venueId)
    .maybeSingle();

  const tier = (venue as { pricing_tier?: string | null } | null)?.pricing_tier;

  const { count, error } = await admin
    .from('staff')
    .select('id', { count: 'exact', head: true })
    .eq('venue_id', venueId);

  if (error) {
    console.error('[assertLightPlanSingleStaffOnly]', error.message, { venueId });
    return { allowed: false, staffCount: 999 };
  }

  const staffCount = count ?? 0;
  if (!isLightTier(tier)) {
    return { allowed: true, staffCount };
  }
  /** Light: exactly one staff row (owner). Inviting adds a second — blocked once the owner exists. */
  return { allowed: staffCount < 1, staffCount };
}
