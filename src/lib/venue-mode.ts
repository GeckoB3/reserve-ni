import type { SupabaseClient } from '@supabase/supabase-js';
import { hasServiceConfig } from '@/lib/availability';

export type AvailabilityEngineMode = 'legacy' | 'service';

export interface VenueMode {
  tableManagementEnabled: boolean;
  availabilityEngine: AvailabilityEngineMode;
}

/**
 * Single resolver for venue operation mode.
 * - `tableManagementEnabled` controls dashboard/table-management UX mode.
 * - `availabilityEngine` controls which availability calculator to use.
 */
export async function resolveVenueMode(
  supabase: SupabaseClient,
  venueId: string
): Promise<VenueMode> {
  const [{ data: venue }, serviceConfigured] = await Promise.all([
    supabase
      .from('venues')
      .select('table_management_enabled')
      .eq('id', venueId)
      .single(),
    hasServiceConfig(supabase, venueId),
  ]);

  return {
    tableManagementEnabled: venue?.table_management_enabled ?? false,
    availabilityEngine: serviceConfigured ? 'service' : 'legacy',
  };
}
