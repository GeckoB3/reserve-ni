import type { SupabaseClient } from '@supabase/supabase-js';
import { hasServiceConfig } from '@/lib/availability';
import type { BookingModel, VenueTerminology } from '@/types/booking-models';
import { DEFAULT_TERMINOLOGY } from '@/types/booking-models';
import {
  getDefaultBookingModelFromActive,
  resolveActiveBookingModels,
} from '@/lib/booking/active-models';
import { activeModelsToLegacyEnabledModels } from '@/lib/booking/active-models';

export type AvailabilityEngineMode = 'legacy' | 'service';

export interface VenueMode {
  bookingModel: BookingModel;
  activeBookingModels: BookingModel[];
  /** Additional bookable models (C/D/E secondaries); excludes primary and invalid entries. */
  enabledModels: BookingModel[];
  tableManagementEnabled: boolean;
  availabilityEngine: AvailabilityEngineMode;
  terminology: VenueTerminology;
}

/**
 * Single resolver for venue operation mode.
 * - `activeBookingModels` lists every booking model the venue exposes.
 * - `bookingModel` is the default model used by older consumers that still expect a single value.
 * - `enabledModels` is a compatibility view of `activeBookingModels` with the default removed.
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
      .select('table_management_enabled, pricing_tier, booking_model, terminology, enabled_models, active_booking_models')
      .eq('id', venueId)
      .single(),
    hasServiceConfig(supabase, venueId),
  ]);

  const activeBookingModels = resolveActiveBookingModels({
    pricingTier: (venue as { pricing_tier?: string | null } | null)?.pricing_tier,
    bookingModel: (venue?.booking_model as BookingModel | undefined) ?? 'table_reservation',
    enabledModels: (venue as { enabled_models?: unknown } | null)?.enabled_models,
    activeBookingModels: (venue as { active_booking_models?: unknown } | null)?.active_booking_models,
  });
  const bookingModel = getDefaultBookingModelFromActive(
    activeBookingModels,
    ((venue?.booking_model as BookingModel | undefined) ?? 'table_reservation'),
  );
  const enabledModels = activeModelsToLegacyEnabledModels(activeBookingModels, bookingModel);
  const terminology: VenueTerminology = {
    ...DEFAULT_TERMINOLOGY[bookingModel],
    ...(venue?.terminology as Partial<VenueTerminology> | null),
  };

  return {
    bookingModel,
    activeBookingModels,
    enabledModels,
    tableManagementEnabled: venue?.table_management_enabled ?? false,
    availabilityEngine: serviceConfigured ? 'service' : 'legacy',
    terminology,
  };
}
