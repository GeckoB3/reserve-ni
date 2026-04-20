import type { SupabaseClient } from '@supabase/supabase-js';

const MAIN_DINING_AREA_NAME = 'Main Dining';

/** First active area by sort_order — used when the venue has a single area or callers omit areaId. */
export async function getDefaultAreaIdForVenue(
  supabase: SupabaseClient,
  venueId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from('areas')
    .select('id')
    .eq('venue_id', venueId)
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
    .limit(1)
    .maybeSingle();
  return (data as { id: string } | null)?.id ?? null;
}

/**
 * Ensures the venue has at least one active dining area, creating "Main Dining" when none exist
 * (same defaults as multi-area migration). Used so onboarding can save services before any
 * explicit area setup.
 */
export async function ensureDefaultDiningAreaForVenue(
  supabase: SupabaseClient,
  venueId: string,
): Promise<string | null> {
  const existing = await getDefaultAreaIdForVenue(supabase, venueId);
  if (existing) return existing;

  const { data: venueRow, error: venueErr } = await supabase
    .from('venues')
    .select('booking_rules, availability_config, communication_templates, deposit_config')
    .eq('id', venueId)
    .maybeSingle();

  if (venueErr || !venueRow) {
    console.error('ensureDefaultDiningAreaForVenue: failed to load venue', venueErr);
    return null;
  }

  const { data: created, error: insErr } = await supabase
    .from('areas')
    .insert({
      venue_id: venueId,
      name: MAIN_DINING_AREA_NAME,
      description: null,
      sort_order: 0,
      is_active: true,
      colour: '#6366F1',
      booking_rules: venueRow.booking_rules,
      availability_config: venueRow.availability_config,
      communication_templates: venueRow.communication_templates ?? {},
      deposit_config: venueRow.deposit_config,
    })
    .select('id')
    .single();

  if (!insErr && created) {
    return (created as { id: string }).id;
  }

  const code = (insErr as { code?: string } | null)?.code;
  if (code === '23505') {
    return getDefaultAreaIdForVenue(supabase, venueId);
  }

  console.error('ensureDefaultDiningAreaForVenue: insert failed', insErr);
  return null;
}

export async function listActiveAreasForVenue(
  supabase: SupabaseClient,
  venueId: string,
): Promise<Array<{ id: string; name: string; colour: string; sort_order: number }>> {
  const { data, error } = await supabase
    .from('areas')
    .select('id, name, colour, sort_order')
    .eq('venue_id', venueId)
    .eq('is_active', true)
    .order('sort_order', { ascending: true });
  if (error) {
    console.error('listActiveAreasForVenue:', error.message);
    return [];
  }
  return (data ?? []) as Array<{ id: string; name: string; colour: string; sort_order: number }>;
}
