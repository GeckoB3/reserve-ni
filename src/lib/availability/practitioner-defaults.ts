import type { WorkingHours } from '@/types/booking-models';

/**
 * Default weekly template for new practitioners (dashboard + API).
 * Keys match JS Date#getDay() (same as getDayOfWeek for YYYY-MM-DD): 0 = Sunday … 6 = Saturday.
 * Monday–Saturday 09:00–17:00; Sunday omitted (treated as closed).
 */
export function defaultPractitionerWorkingHours(): WorkingHours {
  const hours: WorkingHours = {};
  for (const key of ['1', '2', '3', '4', '5', '6'] as const) {
    hours[key] = [{ start: '09:00', end: '17:00' }];
  }
  return hours;
}

/**
 * Default weekly template for new unified calendar columns (staff columns / host calendars).
 * All days 09:00–22:00 so new calendars are bookable until the venue narrows hours in Availability.
 */
export function defaultNewUnifiedCalendarWorkingHours(): WorkingHours {
  const hours: WorkingHours = {};
  for (const key of ['0', '1', '2', '3', '4', '5', '6'] as const) {
    hours[key] = [{ start: '09:00', end: '22:00' }];
  }
  return hours;
}
