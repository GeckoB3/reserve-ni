import type { SupabaseClient } from '@supabase/supabase-js';

export interface ExistingVenueRow {
  venue_id: string;
  pricing_tier: string | null;
  active_booking_models?: unknown;
}

/**
 * If the user email is linked to a staff row, returns that venue's tier (first match).
 */
export async function getExistingVenueForUserEmail(
  admin: SupabaseClient,
  email: string | null | undefined,
): Promise<ExistingVenueRow | null> {
  const normalized = (email ?? '').toLowerCase().trim();
  if (!normalized) return null;

  const { data: staffRows, error: staffErr } = await admin
    .from('staff')
    .select('venue_id')
    .ilike('email', normalized)
    .limit(1);

  if (staffErr || !staffRows?.length) return null;

  const venueId = staffRows[0]!.venue_id as string;
  const { data: venue, error: venueErr } = await admin
    .from('venues')
    .select('pricing_tier, active_booking_models')
    .eq('id', venueId)
    .maybeSingle();

  if (venueErr || !venue) return null;

  return {
    venue_id: venueId,
    pricing_tier: (venue as { pricing_tier?: string | null }).pricing_tier ?? null,
    active_booking_models: (venue as { active_booking_models?: unknown }).active_booking_models,
  };
}
