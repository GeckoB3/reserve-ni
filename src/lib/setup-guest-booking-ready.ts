import type { SupabaseClient } from '@supabase/supabase-js';
import { hasServiceConfig } from '@/lib/availability';
import { fetchAppointmentCatalog } from '@/lib/availability/appointment-catalog';
import type { BookingModel } from '@/types/booking-models';
import { isUnifiedSchedulingVenue } from '@/lib/booking/unified-scheduling';

/**
 * Whether guests can complete a booking on the public page (aligned with /api/booking/create and catalog API).
 */
export async function computeGuestBookingReady(
  admin: SupabaseClient,
  venueId: string,
  bookingModel: BookingModel,
  /** For non–Model A/B, reuse generic "has any catalog row" from setup-status. */
  availabilitySetFallback: boolean,
): Promise<boolean> {
  if (bookingModel === 'table_reservation') {
    return hasServiceConfig(admin, venueId);
  }
  if (isUnifiedSchedulingVenue(bookingModel)) {
    const catalog = await fetchAppointmentCatalog(admin, venueId);
    return catalog.practitioners.length > 0;
  }
  return availabilitySetFallback;
}
