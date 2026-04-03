import type { SupabaseClient } from '@supabase/supabase-js';
import { hasServiceConfig } from '@/lib/availability';
import { normalizeEnabledModels } from '@/lib/booking/enabled-models';
import type { BookingModel, VenueTerminology } from '@/types/booking-models';
import { DEFAULT_TERMINOLOGY } from '@/types/booking-models';

export type AvailabilityEngineMode = 'legacy' | 'service';

export interface VenueMode {
  bookingModel: BookingModel;
  /** Additional bookable models (C/D/E secondaries); excludes primary and invalid entries. */
  enabledModels: BookingModel[];
  tableManagementEnabled: boolean;
  availabilityEngine: AvailabilityEngineMode;
  terminology: VenueTerminology;
}

/**
 * Single resolver for venue operation mode.
 * - `bookingModel` determines primary engine, dashboard views, and default public flow.
 * - `enabledModels` lists secondary bookable types (see `venues.enabled_models`).
 * - `tableManagementEnabled` controls dashboard/table-management UX mode (Model A only).
 * - `availabilityEngine` controls which availability calculator to use (Model A only).
 * - `terminology` drives label substitution across UI.
 */
export async function resolveVenueMode(
  supabase: SupabaseClient,
  venueId: string
): Promise<VenueMode> {
  const [{ data: venue }, serviceConfigured] = await Promise.all([
    supabase
      .from('venues')
      .select('table_management_enabled, booking_model, terminology, enabled_models')
      .eq('id', venueId)
      .single(),
    hasServiceConfig(supabase, venueId),
  ]);

  const bookingModel: BookingModel = (venue?.booking_model as BookingModel) ?? 'table_reservation';
  const enabledModels = normalizeEnabledModels(
    (venue as { enabled_models?: unknown } | null)?.enabled_models,
    bookingModel
  );
  const terminology: VenueTerminology = {
    ...DEFAULT_TERMINOLOGY[bookingModel],
    ...(venue?.terminology as Partial<VenueTerminology> | null),
  };

  return {
    bookingModel,
    enabledModels,
    tableManagementEnabled: venue?.table_management_enabled ?? false,
    availabilityEngine: serviceConfigured ? 'service' : 'legacy',
    terminology,
  };
}
