import { getSupabaseAdminClient } from '@/lib/supabase';
import { hasServiceConfig } from '@/lib/availability';
import { normalizeEnabledModels } from '@/lib/booking/enabled-models';
import type { BookingModel } from '@/types/booking-models';
import type { VenuePublic } from '@/components/booking/types';

/** Loads a venue for the public /book/[slug] pages (admin client; slug is public). */
export async function getPublicVenueForBookBySlug(slug: string): Promise<VenuePublic | null> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('venues')
    .select(
      'id, name, slug, cover_photo_url, address, phone, website_url, deposit_config, booking_rules, opening_hours, timezone, booking_model, enabled_models, terminology, currency',
    )
    .eq('slug', slug)
    .single();
  if (error || !data) return null;

  const bookingModel = (data.booking_model as BookingModel) ?? 'table_reservation';
  const row = data as { enabled_models?: unknown };
  (data as VenuePublic).enabled_models = normalizeEnabledModels(row.enabled_models, bookingModel);

  if (bookingModel === 'table_reservation') {
    const usesNewEngine = await hasServiceConfig(supabase, data.id);
    if (usesNewEngine) {
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
