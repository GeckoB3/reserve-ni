import type { SupabaseClient } from '@supabase/supabase-js';
import type { BookingModel } from '@/types/booking-models';
import { normalizeEnabledModels } from '@/lib/booking/enabled-models';
import { venueUsesUnifiedAppointmentData } from '@/lib/booking/unified-scheduling';

/**
 * Unified appointment/service data is used when unified scheduling is primary
 * or when appointment models are enabled as secondary models.
 */
export async function venueUsesUnifiedAppointmentServiceData(
  admin: SupabaseClient,
  venueId: string,
): Promise<boolean> {
  const { data } = await admin
    .from('venues')
    .select('booking_model, enabled_models')
    .eq('id', venueId)
    .maybeSingle();
  const primary = ((data as { booking_model?: string } | null)?.booking_model as BookingModel) ?? 'table_reservation';
  const enabled = normalizeEnabledModels(
    (data as { enabled_models?: unknown } | null)?.enabled_models,
    primary,
  );
  return venueUsesUnifiedAppointmentData(primary, enabled);
}
