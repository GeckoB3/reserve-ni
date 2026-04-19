import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * When `venues.email` is empty, set it from the venue admin's staff row (their sign-in email).
 * Used at signup (insert) and as a one-time backfill when admins load settings or GET /api/venue.
 */
export async function backfillVenueEmailIfEmptyFromStaff(
  db: SupabaseClient,
  venueId: string,
  venueEmail: string | null | undefined,
  staffEmail: string | null | undefined,
): Promise<string | null> {
  const existing = String(venueEmail ?? '').trim();
  if (existing) return existing;
  const fallback = (staffEmail ?? '').trim().toLowerCase();
  if (!fallback) return null;
  const { error } = await db
    .from('venues')
    .update({ email: fallback, updated_at: new Date().toISOString() })
    .eq('id', venueId);
  if (error) {
    console.warn('[backfillVenueEmailIfEmptyFromStaff]', error.message);
    return null;
  }
  return fallback;
}
