import { getSupabaseAdminClient } from '@/lib/supabase';
import { DEFAULT_TERMINOLOGY, type BookingModel, type VenueTerminology } from '@/types/booking-models';
import {
  getDefaultBookingModelFromActive,
  resolveActiveBookingModels,
} from '@/lib/booking/active-models';

export async function getVenueImportTerminology(venueId: string): Promise<VenueTerminology> {
  const admin = getSupabaseAdminClient();
  const { data: venue } = await admin
    .from('venues')
    .select('booking_model, terminology, pricing_tier, enabled_models, active_booking_models')
    .eq('id', venueId)
    .maybeSingle();

  const activeModels = resolveActiveBookingModels({
    pricingTier: (venue as { pricing_tier?: string | null } | null)?.pricing_tier,
    bookingModel: (venue?.booking_model as BookingModel | undefined) ?? 'table_reservation',
    enabledModels: (venue as { enabled_models?: unknown } | null)?.enabled_models,
    activeBookingModels: (venue as { active_booking_models?: unknown } | null)?.active_booking_models,
  });
  const bm = getDefaultBookingModelFromActive(
    activeModels,
    (venue?.booking_model as BookingModel) ?? 'table_reservation',
  );
  const base = DEFAULT_TERMINOLOGY[bm] ?? DEFAULT_TERMINOLOGY.unified_scheduling;
  const raw = (venue as { terminology?: unknown } | null)?.terminology;
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return { ...base, ...(raw as Partial<VenueTerminology>) };
  }
  return base;
}
