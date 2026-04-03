import { getSupabaseAdminClient } from '@/lib/supabase';

export type PricingTier = 'standard' | 'business' | 'founding';

interface VenueTier {
  pricing_tier: PricingTier;
  calendar_count: number | null;
}

/**
 * Check whether a venue on the Standard tier has reached its calendar limit.
 * Returns { allowed: true } or { allowed: false, current, limit }.
 * Business/Founding tiers always pass (unlimited).
 *
 * For `unified_scheduling` venues, bookable calendars live in `unified_calendars` (plan §2.2);
 * counting `practitioners` alone would diverge from subscription limits.
 *
 * Do not use this for `class_types`: class offerings are unlimited; subscription limits are for staff calendars.
 */
export async function checkCalendarLimit(
  venueId: string,
  countTable: 'practitioners' | 'venue_resources' | 'experience_events'
): Promise<{ allowed: boolean; current?: number; limit?: number }> {
  const admin = getSupabaseAdminClient();

  const { data: venue } = await admin
    .from('venues')
    .select('pricing_tier, calendar_count, booking_model')
    .eq('id', venueId)
    .single();

  if (!venue) return { allowed: false };

  const tier = venue as VenueTier & { booking_model?: string };

  if (tier.pricing_tier !== 'standard') {
    return { allowed: true };
  }

  const limit = tier.calendar_count ?? 1;

  const effectiveTable =
    tier.booking_model === 'unified_scheduling' && countTable === 'practitioners'
      ? 'unified_calendars'
      : countTable;

  const { count, error } = await admin
    .from(effectiveTable)
    .select('id', { count: 'exact', head: true })
    .eq('venue_id', venueId)
    .eq('is_active', true);

  if (error) {
    console.error(`[checkCalendarLimit] Failed to count ${effectiveTable}:`, error);
    return { allowed: false };
  }

  const current = count ?? 0;

  return current < limit
    ? { allowed: true, current, limit }
    : { allowed: false, current, limit };
}

/**
 * Standard tier: total active `experience_events` rows must not exceed `calendar_count`.
 * Use when creating multiple event occurrences in one request.
 */
export async function checkExperienceEventBatchLimit(
  venueId: string,
  eventsToAdd: number
): Promise<{ allowed: boolean; current?: number; limit?: number }> {
  const admin = getSupabaseAdminClient();

  const { data: venue } = await admin
    .from('venues')
    .select('pricing_tier, calendar_count')
    .eq('id', venueId)
    .single();

  if (!venue) return { allowed: false };

  const tier = ((venue as VenueTier).pricing_tier ?? 'standard') as PricingTier;
  if (tier !== 'standard') {
    return { allowed: true };
  }

  const limit = (venue as VenueTier).calendar_count ?? 1;

  const { count, error } = await admin
    .from('experience_events')
    .select('id', { count: 'exact', head: true })
    .eq('venue_id', venueId)
    .eq('is_active', true);

  if (error) {
    console.error('[checkExperienceEventBatchLimit] count failed:', error);
    return { allowed: false };
  }

  const current = count ?? 0;
  if (current + eventsToAdd <= limit) {
    return { allowed: true, current, limit };
  }
  return { allowed: false, current, limit };
}

/**
 * Check if a venue's tier allows SMS communications.
 * Unified Scheduling plan §1.1: Standard, Business, and Founding all include SMS (allowances differ).
 */
export async function isSmsAllowed(venueId: string): Promise<boolean> {
  const admin = getSupabaseAdminClient();
  const { data: venue } = await admin
    .from('venues')
    .select('pricing_tier')
    .eq('id', venueId)
    .single();

  if (!venue) return false;
  const tier = ((venue.pricing_tier as string) ?? 'standard').toLowerCase();
  return tier === 'standard' || tier === 'business' || tier === 'founding';
}

/**
 * Check if table management is allowed for a venue.
 * Only Business/Founding tier restaurants get table management.
 */
export async function isTableManagementAllowed(venueId: string): Promise<boolean> {
  const admin = getSupabaseAdminClient();
  const { data: venue } = await admin
    .from('venues')
    .select('pricing_tier, booking_model')
    .eq('id', venueId)
    .single();

  if (!venue) return false;
  return (
    (venue.booking_model as string) === 'table_reservation' &&
    (venue.pricing_tier as string) !== 'standard'
  );
}
