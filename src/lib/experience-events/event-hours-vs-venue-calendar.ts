/**
 * Validates that an experience event's [start, end) lies within venue opening hours (when configured)
 * and the assigned team calendar's working hours, excluding breaks.
 */

import type { AvailabilityBlock, OpeningHours } from '@/types/availability';
import type { Practitioner, WorkingHours } from '@/types/booking-models';
import type { VenueOpeningException } from '@/types/venue-opening-exceptions';
import { getOpeningPeriodsForDay, getDayOfWeek, timeToMinutes } from '@/lib/availability';
import { unifiedCalendarRowToPractitioner } from '@/lib/availability/unified-calendar-mapper';
import {
  resolveVenueWideAllowedMinuteRanges,
  venueWideResolutionToNullableRanges,
} from '@/lib/availability/venue-wide-business-hours';

const DAY_NAMES = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

function dayKeyForDate(dateStr: string): string {
  return String(getDayOfWeek(dateStr));
}

function dayNameForDate(dateStr: string): string {
  return DAY_NAMES[getDayOfWeek(dateStr)]!;
}

function isVenueOpeningHoursConfigured(openingHours: OpeningHours | null | undefined): boolean {
  return openingHours != null && typeof openingHours === 'object' && Object.keys(openingHours).length > 0;
}

function findApplicableVenueOpeningException(
  exceptions: VenueOpeningException[] | null | undefined,
  dateStr: string,
): VenueOpeningException | null {
  if (!exceptions?.length) return null;
  for (const ex of exceptions) {
    if (ex.date_start <= dateStr && dateStr <= ex.date_end) return ex;
  }
  return null;
}

/** Venue open minute ranges for this date (exceptions override weekly hours). */
function venueMinuteRangesForDate(
  venueOpeningHours: OpeningHours | null | undefined,
  dateStr: string,
  exceptions: VenueOpeningException[] | null | undefined,
): Array<{ start: number; end: number }> | null {
  const ex = findApplicableVenueOpeningException(exceptions, dateStr);
  if (ex) {
    if (ex.closed) return [];
    if (ex.periods?.length) {
      return ex.periods.map((p) => ({
        start: timeToMinutes(p.open.slice(0, 5)),
        end: timeToMinutes(p.close.slice(0, 5)),
      }));
    }
  }
  if (isVenueOpeningHoursConfigured(venueOpeningHours)) {
    const day = getDayOfWeek(dateStr);
    const periods = getOpeningPeriodsForDay(venueOpeningHours, day);
    return periods.map((p) => ({ start: timeToMinutes(p.open), end: timeToMinutes(p.close) }));
  }
  return null;
}

function getWorkingRangesForPractitioner(practitioner: Practitioner, dateStr: string): Array<{ start: number; end: number }> {
  const dayKey = dayKeyForDate(dateStr);
  const dayName = dayNameForDate(dateStr);
  if (Array.isArray(practitioner.days_off)) {
    for (const d of practitioner.days_off) {
      if (d === dateStr || d === dayName) return [];
    }
  }
  const hours = practitioner.working_hours as WorkingHours;
  const ranges = hours[dayKey] ?? hours[dayName];
  if (!ranges || ranges.length === 0) return [];
  return ranges.map((r) => ({ start: timeToMinutes(r.start), end: timeToMinutes(r.end) }));
}

function getBreakRangesForPractitioner(practitioner: Practitioner, dateStr: string): Array<{ start: number; end: number }> {
  const byDay = practitioner.break_times_by_day;
  if (byDay && typeof byDay === 'object' && !Array.isArray(byDay) && Object.keys(byDay).length > 0) {
    const dayKey = dayKeyForDate(dateStr);
    const dayName = dayNameForDate(dateStr);
    const ranges = byDay[dayKey] ?? byDay[dayName];
    if (!ranges || !Array.isArray(ranges) || ranges.length === 0) return [];
    return ranges.map((b) => ({ start: timeToMinutes(b.start), end: timeToMinutes(b.end) }));
  }
  const breaks = practitioner.break_times;
  if (!Array.isArray(breaks)) return [];
  return breaks.map((b) => ({ start: timeToMinutes(b.start), end: timeToMinutes(b.end) }));
}

function subtractOneRange(
  r: { start: number; end: number },
  cut: { start: number; end: number },
): Array<{ start: number; end: number }> {
  if (cut.end <= r.start || cut.start >= r.end) return [r];
  const out: Array<{ start: number; end: number }> = [];
  if (cut.start > r.start) {
    const segEnd = Math.min(cut.start, r.end);
    if (segEnd > r.start) out.push({ start: r.start, end: segEnd });
  }
  if (cut.end < r.end) {
    const segStart = Math.max(cut.end, r.start);
    if (r.end > segStart) out.push({ start: segStart, end: r.end });
  }
  return out;
}

function subtractRangesFromRanges(
  ranges: Array<{ start: number; end: number }>,
  toRemove: Array<{ start: number; end: number }>,
): Array<{ start: number; end: number }> {
  let result = ranges.filter((r) => r.end > r.start);
  for (const cut of toRemove) {
    if (cut.end <= cut.start) continue;
    const next: Array<{ start: number; end: number }> = [];
    for (const r of result) {
      next.push(...subtractOneRange(r, cut));
    }
    result = next;
  }
  return result;
}

function intersectMinuteRanges(
  a: Array<{ start: number; end: number }>,
  b: Array<{ start: number; end: number }>,
): Array<{ start: number; end: number }> {
  const out: Array<{ start: number; end: number }> = [];
  for (const ra of a) {
    for (const rb of b) {
      const s = Math.max(ra.start, rb.start);
      const e = Math.min(ra.end, rb.end);
      if (s < e) out.push({ start: s, end: e });
    }
  }
  return out.sort((x, y) => x.start - y.start);
}

/**
 * Calendar bookable segments (working hours minus breaks) for this date.
 */
export function calendarSegmentsForDate(ucRow: Record<string, unknown>, dateStr: string): Array<{ start: number; end: number }> {
  const p = unifiedCalendarRowToPractitioner(ucRow);
  const working = getWorkingRangesForPractitioner(p, dateStr);
  const breaks = getBreakRangesForPractitioner(p, dateStr);
  return subtractRangesFromRanges(working, breaks);
}

export type VenueHoursInput = {
  opening_hours: OpeningHours | null | undefined;
  venue_opening_exceptions: VenueOpeningException[] | null | undefined;
  /**
   * When defined (including []), venue-wide `availability_blocks` drive closures/amended hours.
   * When undefined, legacy `venue_opening_exceptions` JSONB is used.
   */
  availability_blocks?: AvailabilityBlock[] | null;
};

/**
 * Returns null if the event window is valid; otherwise a user-facing error message.
 * When venue has no opening-hours config and no applicable exception, only the calendar column is enforced.
 */
export function validateExperienceEventWindowAgainstVenueAndCalendar(
  eventDate: string,
  startTimeHhMm: string,
  endTimeHhMm: string,
  venue: VenueHoursInput,
  unifiedCalendarRow: Record<string, unknown>,
): string | null {
  const start = timeToMinutes(startTimeHhMm.slice(0, 5));
  const end = timeToMinutes(endTimeHhMm.slice(0, 5));
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return 'End time must be after start time.';
  }

  const calSegments = calendarSegmentsForDate(unifiedCalendarRow, eventDate);
  if (calSegments.length === 0) {
    return 'This calendar has no working hours on that date (or the team is marked off). Choose another date or time.';
  }

  const venueRanges =
    venue.availability_blocks !== undefined
      ? venueWideResolutionToNullableRanges(
          resolveVenueWideAllowedMinuteRanges(
            venue.opening_hours,
            eventDate,
            venue.availability_blocks ?? [],
          ),
        )
      : venueMinuteRangesForDate(venue.opening_hours, eventDate, venue.venue_opening_exceptions ?? null);

  let allowed: Array<{ start: number; end: number }>;
  if (venueRanges === null) {
    allowed = calSegments;
  } else if (venueRanges.length === 0) {
    return 'The venue is closed on this date. Choose another date or time.';
  } else {
    allowed = intersectMinuteRanges(calSegments, venueRanges);
  }

  if (allowed.length === 0) {
    return 'Event time is outside venue opening hours or this calendar’s working hours on that date.';
  }

  const fits = allowed.some((seg) => start >= seg.start && end <= seg.end);
  if (!fits) {
    return 'Event time must fall fully within venue opening hours and this calendar’s working hours (it cannot overlap a break).';
  }

  return null;
}
