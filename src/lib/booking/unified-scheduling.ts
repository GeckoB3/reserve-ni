import type { BookingModel } from '@/types/booking-models';

/**
 * Unified Scheduling Engine (USE): practitioner-style appointments plus events/classes/resources
 * via unified_calendars. New signups use `unified_scheduling`; legacy rows may still be
 * `practitioner_appointment` - both are treated the same here.
 */
export function isUnifiedSchedulingVenue(bookingModel: BookingModel | string | null | undefined): boolean {
  return bookingModel === 'practitioner_appointment' || bookingModel === 'unified_scheduling';
}
