import type { BookingModel } from '@/types/booking-models';
import { isUnifiedSchedulingVenue } from '@/lib/booking/unified-scheduling';

/** Models that contribute to the staff Schedule calendar (excludes Model A table rows per plan §4.2). */
const SCHEDULE_CALENDAR_MODELS: BookingModel[] = ['event_ticket', 'class_session', 'resource_booking'];

/**
 * Whether `/dashboard/calendar` should be available — Docs/ReserveNI_Unified_Booking_Functionality.md §4.2 entry rule.
 * Table-only venues (no C/D/E primary or secondary) use day sheet / table tools instead.
 */
export function isVenueScheduleCalendarEligible(
  bookingModel: BookingModel,
  enabledModels: BookingModel[],
): boolean {
  if (isUnifiedSchedulingVenue(bookingModel)) return true;
  if (SCHEDULE_CALENDAR_MODELS.includes(bookingModel)) return true;
  return enabledModels.some((m) => SCHEDULE_CALENDAR_MODELS.includes(m));
}

/**
 * Full practitioner/appointment grid (`PractitionerCalendarView`) — **unified / practitioner primaries only**.
 * Table reservations (`table_reservation`) never use this view; they use **Day sheet / Floor plan** for Model A and
 * {@link StaffScheduleHub} (merged C/D/E from `/api/venue/schedule`) when secondaries are enabled.
 */
export function isPractitionerScheduleCalendar(bookingModel: BookingModel): boolean {
  return isUnifiedSchedulingVenue(bookingModel);
}
