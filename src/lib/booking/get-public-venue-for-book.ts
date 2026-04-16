import { getSupabaseAdminClient } from '@/lib/supabase';
import { resolveVenueMode } from '@/lib/venue-mode';
import type { VenuePublic } from '@/components/booking/types';
import { listActiveAreasForVenue } from '@/lib/areas/resolve-default-area';

/** Loads a venue for the public /book/[slug] pages (admin client; slug is public). */
export async function getPublicVenueForBookBySlug(slug: string): Promise<VenuePublic | null> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('venues')
    .select(
      'id, name, slug, cover_photo_url, address, phone, website_url, deposit_config, booking_rules, opening_hours, timezone, booking_model, enabled_models, active_booking_models, terminology, currency, public_booking_area_mode',
    )
    .eq('slug', slug)
    .single();
  if (error || !data) return null;

  const venueMode = await resolveVenueMode(supabase, data.id);
  (data as VenuePublic).booking_model = venueMode.bookingModel;
  (data as VenuePublic).active_booking_models = venueMode.activeBookingModels;
  (data as VenuePublic).enabled_models = venueMode.enabledModels;
  (data as VenuePublic).terminology = venueMode.terminology;

  if (venueMode.bookingModel === 'table_reservation') {
    (data as VenuePublic).areas = await listActiveAreasForVenue(supabase, data.id);
    if (venueMode.availabilityEngine === 'service') {
      const { data: restriction } = await supabase
        .from('booking_restrictions')
        .select('min_party_size_online, max_party_size_online')
        .eq('venue_id', data.id)
        .limit(1)
        .maybeSingle();

      if (restriction) {
        data.booking_rules = {
          min_party_size: restriction.min_party_size_online,
          max_party_size: restriction.max_party_size_online,
        };
      }
    }
  }

  return data as VenuePublic;
}
