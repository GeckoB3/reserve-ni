/**
 * Parse `booking_time` (HH:MM or HH:MM:SS) to minutes from midnight for comparisons.
 */
export function parseBookingTimeToMinutes(bookingTime: string): number {
  const t = bookingTime.trim();
  const parts = t.split(':').map((p) => parseInt(p, 10));
  const h = Number.isFinite(parts[0]) ? parts[0]! : 0;
  const m = Number.isFinite(parts[1]) ? parts[1]! : 0;
  const s = Number.isFinite(parts[2]) ? parts[2]! : 0;
  return h * 60 + m + Math.floor(s / 60);
}

/**
 * Half-open window [startHour, endHour) in whole hours, matching CalendarDateTimePicker.
 */
export function isBookingTimeInHourRange(bookingTime: string, startHour: number, endHour: number): boolean {
  const minutes = parseBookingTimeToMinutes(bookingTime);
  return minutes >= startHour * 60 && minutes < endHour * 60;
}
