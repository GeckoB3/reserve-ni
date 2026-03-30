import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Min/max party size aligned with the public booking engine (restrictions per active service, else venue booking_rules).
 */
export async function resolvePartySizeBoundsForVenueServices(
  supabase: SupabaseClient,
  venueId: string,
): Promise<{ min: number; max: number }> {
  const { data: activeServices } = await supabase
    .from('venue_services')
    .select('id')
    .eq('venue_id', venueId)
    .eq('is_active', true);
  const serviceIds = (activeServices ?? []).map((s) => s.id);
  let minParty = 1;
  let maxParty = 50;
  if (serviceIds.length > 0) {
    const { data: restrRows } = await supabase
      .from('booking_restrictions')
      .select('min_party_size_online, max_party_size_online')
      .in('service_id', serviceIds);
    for (const row of restrRows ?? []) {
      minParty = Math.max(minParty, row.min_party_size_online ?? 1);
      maxParty = Math.min(maxParty, row.max_party_size_online ?? 50);
    }
  } else {
    const { data: venue } = await supabase.from('venues').select('booking_rules').eq('id', venueId).maybeSingle();
    const rules = (venue?.booking_rules as { min_party_size?: number; max_party_size?: number }) ?? {};
    minParty = rules.min_party_size ?? 1;
    maxParty = rules.max_party_size ?? 50;
  }
  return { min: minParty, max: maxParty };
}
