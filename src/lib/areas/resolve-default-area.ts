import type { SupabaseClient } from '@supabase/supabase-js';

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
