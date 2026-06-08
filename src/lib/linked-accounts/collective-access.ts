import type { SupabaseClient } from '@supabase/supabase-js';

export interface CollectiveAccess {
  id: string;
  hostVenueId: string;
  status: string;
  pageMode: string;
  isHost: boolean;
  memberId: string | null;
}

/**
 * Resolve the caller's relationship to a collective (host / active member).
 * Shared by the catalogue route and the page-asset upload route.
 */
export async function loadCollectiveAccess(
  admin: SupabaseClient,
  collectiveId: string,
  venueId: string,
): Promise<CollectiveAccess | null> {
  const { data: collective } = await admin
    .from('venue_collectives')
    .select('id, host_venue_id, status, page_mode')
    .eq('id', collectiveId)
    .maybeSingle();
  if (!collective) return null;
  const { data: member } = await admin
    .from('venue_collective_members')
    .select('id')
    .eq('collective_id', collectiveId)
    .eq('venue_id', venueId)
    .eq('status', 'active')
    .maybeSingle();
  return {
    id: collective.id as string,
    hostVenueId: collective.host_venue_id as string,
    status: collective.status as string,
    pageMode: collective.page_mode as string,
    isHost: (collective.host_venue_id as string) === venueId,
    memberId: (member?.id as string | null) ?? null,
  };
}
