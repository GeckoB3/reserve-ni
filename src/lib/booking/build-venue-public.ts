import { getSupabaseAdminClient } from '@/lib/supabase';
import { resolveVenueMode } from '@/lib/venue-mode';
import type { VenuePublic } from '@/components/booking/types';

/**
 * Builds the same public booking profile shape as GET /api/booking/venue?slug=…, but by venue id.
 * Used by dashboard server pages that embed public booking flows.
 */
export async function buildVenuePublicForBookingById(venueId: string): Promise<VenuePublic | null> {
  const supabase = getSupabaseAdminClient();
  const { data: venue, error } = await supabase
    .from('venues')
    .select(
      'id, name, slug, cover_photo_url, address, phone, website_url, deposit_config, booking_rules, opening_hours, timezone, booking_model, enabled_models, active_booking_models, terminology, currency',
    )
    .eq('id', venueId)
    .single();

  if (error || !venue) {
    return null;
  }

  const venueMode = await resolveVenueMode(supabase, venue.id);

  let booking_rules = venue.booking_rules as VenuePublic['booking_rules'];
  if (venueMode.bookingModel === 'table_reservation') {
    const usesNewEngine = venueMode.availabilityEngine === 'service';
    if (usesNewEngine) {
      const { data: restriction } = await supabase
        .from('booking_restrictions')
        .select('min_party_size_online, max_party_size_online')
        .eq('venue_id', venue.id)
        .limit(1)
        .maybeSingle();

      if (restriction) {
        booking_rules = {
          min_party_size: restriction.min_party_size_online,
          max_party_size: restriction.max_party_size_online,
        };
      }
    }
  }

  return {
    ...(venue as unknown as VenuePublic),
    booking_rules,
    booking_model: venueMode.bookingModel,
    active_booking_models: venueMode.activeBookingModels,
    enabled_models: venueMode.enabledModels,
    terminology: venueMode.terminology,
  };
}
