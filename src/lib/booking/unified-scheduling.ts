import type { BookingModel } from '@/types/booking-models';
import { isAppointmentPlanTier } from '@/lib/tier-enforcement';

/**
 * Unified Scheduling Engine (USE): practitioner-style appointments plus events/classes/resources
 * via unified_calendars. New signups use `unified_scheduling`; legacy rows may still be
 * `practitioner_appointment` - both are treated the same here.
 */
export function isUnifiedSchedulingVenue(bookingModel: BookingModel | string | null | undefined): boolean {
  return bookingModel === 'practitioner_appointment' || bookingModel === 'unified_scheduling';
}

/**
 * Appointments Light / Plus / Pro SKU — any mix of active booking models (resources, events, USE, etc.).
 * Prefer this over `isUnifiedSchedulingVenue(booking_model)` for product-level dashboard/settings behaviour.
 */
export function isAppointmentsProductVenue(pricingTier: string | null | undefined): boolean {
  return isAppointmentPlanTier(pricingTier);
}

/**
 * Use appointment-family dashboard/bookings/reports copy and surfaces when the venue is on an
 * Appointments SKU, or when USE is the primary model or enabled as a secondary tab (restaurant + appointments).
 */
export function isAppointmentDashboardExperience(
  pricingTier: string | null | undefined,
  primaryBookingModel: BookingModel | string | null | undefined,
  enabledModels?: readonly BookingModel[] | null,
): boolean {
  if (isAppointmentPlanTier(pricingTier)) return true;
  if (isUnifiedSchedulingVenue(primaryBookingModel)) return true;
  return Boolean(enabledModels?.includes('unified_scheduling'));
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
