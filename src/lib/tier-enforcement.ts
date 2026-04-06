import { getSupabaseAdminClient } from '@/lib/supabase';

export type PricingTier = 'appointments' | 'restaurant' | 'founding';

/**
 * Restaurant / Founding tiers: table reservations, dining availability, floor plan.
 * Appointments tier excludes these even if `booking_model` is `table_reservation`.
 */
export function isRestaurantTableProductTier(pricingTier: string | null | undefined): boolean {
  const t = (pricingTier ?? '').toLowerCase().trim();
  return t === 'restaurant' || t === 'founding';
}

/**
 * Guest communications "Table bookings" templates (restaurant-product plans).
 */
export function isRestaurantCommsTier(pricingTier: string | null | undefined): boolean {
  const t = (pricingTier ?? '').toLowerCase().trim();
  return t === 'restaurant' || t === 'founding';
}

/** Appointments product plan — use unified / "Appointments & other bookings" messaging, not table-only. */
export function isAppointmentPlanTier(pricingTier: string | null | undefined): boolean {
  const t = (pricingTier ?? '').toLowerCase().trim();
  return t === 'appointments';
}

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
 * All active tiers (appointments, restaurant, founding) include SMS.
 * Returns true when the venue exists (i.e. has a known tier).
 */
export async function isSmsAllowed(venueId: string): Promise<boolean> {
  const admin = getSupabaseAdminClient();
  const { data: venue } = await admin
    .from('venues')
    .select('id')
    .eq('id', venueId)
    .single();

  return !!venue;
}

/**
 * Table management is allowed for restaurant / founding tier venues with table_reservation model.
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
    isRestaurantTableProductTier(venue.pricing_tier as string)
  );
}
