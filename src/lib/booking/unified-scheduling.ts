import type { BookingModel } from '@/types/booking-models';

/**
 * Unified Scheduling Engine (USE): practitioner-style appointments plus events/classes/resources
 * via unified_calendars. New signups use `unified_scheduling`; legacy rows may still be
 * `practitioner_appointment` - both are treated the same here.
 */
export function isUnifiedSchedulingVenue(bookingModel: BookingModel | string | null | undefined): boolean {
  return bookingModel === 'practitioner_appointment' || bookingModel === 'unified_scheduling';
}

/**
 * True when the venue stores appointments in `service_items` + `calendar_service_assignments`
 * (USE data model). That is the case when the primary model is `unified_scheduling`, or when
 * `unified_scheduling` is enabled as a secondary tab (e.g. restaurant + appointments).
 */
export function venueUsesUnifiedAppointmentData(
  primary: BookingModel,
  enabledModels: BookingModel[],
): boolean {
  if (primary === 'unified_scheduling') return true;
  return enabledModels.includes('unified_scheduling');
}
