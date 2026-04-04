import { getSupabaseAdminClient } from '@/lib/supabase';

export type PricingTier = 'standard' | 'business' | 'founding' | 'appointments' | 'restaurant';


/**
 * Calendar limits have been removed - all plans now include unlimited calendars.
 * Kept for API compatibility; always returns allowed.
 */
export async function checkCalendarLimit(
  _venueId: string,
  _countTable: 'practitioners' | 'venue_resources' | 'experience_events'
): Promise<{ allowed: boolean; current?: number; limit?: number }> {
  return { allowed: true };
}

/**
 * Event batch limits have been removed - all plans allow unlimited events.
 * Kept for API compatibility; always returns allowed.
 */
export async function checkExperienceEventBatchLimit(
  _venueId: string,
  _eventsToAdd: number
): Promise<{ allowed: boolean; current?: number; limit?: number }> {
  return { allowed: true };
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
  const tier = ((venue.pricing_tier as string) ?? 'appointments').toLowerCase();
  return tier === 'standard' || tier === 'business' || tier === 'founding'
    || tier === 'appointments' || tier === 'restaurant';
}

/**
 * Check if table management is allowed for a venue.
 * Restaurant, Business, and Founding tier restaurants get table management.
 */
export async function isTableManagementAllowed(venueId: string): Promise<boolean> {
  const admin = getSupabaseAdminClient();
  const { data: venue } = await admin
    .from('venues')
    .select('pricing_tier, booking_model')
    .eq('id', venueId)
    .single();

  if (!venue) return false;
  const tier = ((venue.pricing_tier as string) ?? '').toLowerCase();
  return (
    (venue.booking_model as string) === 'table_reservation' &&
    (tier === 'restaurant' || tier === 'business' || tier === 'founding')
  );
}
