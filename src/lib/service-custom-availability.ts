/**
 * Optional per-service weekly hours: intersected with venue + calendar effective ranges in the appointment engine.
 */

import type { AppointmentService } from '@/types/booking-models';
import type { WorkingHours } from '@/types/booking-models';
import type { OpeningHours } from '@/types/availability';
import { getDayOfWeek } from '@/lib/availability/engine';
import { getOpeningPeriodsForDay, minutesToTime, timeToMinutes } from '@/lib/availability';

const DAY_NAMES = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

function dayKeyForDate(dateStr: string): string {
  return String(getDayOfWeek(dateStr));
}

function dayNameForDate(dateStr: string): string {
  const dow = getDayOfWeek(dateStr);
  return DAY_NAMES[dow]!;
}

/** Minute ranges for one calendar date from a WorkingHours map (keys "0"–"6" or sun–sat). */
export function getMinuteRangesFromWorkingHoursForDate(
  wh: WorkingHours | null | undefined,
  dateStr: string,
): Array<{ start: number; end: number }> {
  if (!wh || typeof wh !== 'object') return [];
  const dayKey = dayKeyForDate(dateStr);
  const dayName = dayNameForDate(dateStr);
  const ranges = wh[dayKey] ?? wh[dayName];
  if (!ranges || !Array.isArray(ranges) || ranges.length === 0) return [];
  return ranges.map((r) => ({
    start: timeToMinutes(String(r.start).slice(0, 5)),
    end: timeToMinutes(String(r.end).slice(0, 5)),
  }));
}

/** Intersect two lists of [start,end) minute ranges (same as appointment-engine). */
export function intersectMinuteRanges(
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
 * After venue + calendar clipping: optionally intersect with per-service weekly hours.
 */
export function intersectEffectiveRangesWithServiceCustom(
  effectiveWorkingRanges: Array<{ start: number; end: number }>,
  svc: AppointmentService,
  dateStr: string,
): Array<{ start: number; end: number }> {
  if (!svc.custom_availability_enabled || !svc.custom_working_hours) {
    return effectiveWorkingRanges;
  }
  const custom = getMinuteRangesFromWorkingHoursForDate(svc.custom_working_hours, dateStr);
  if (custom.length === 0) return [];
  return intersectMinuteRanges(effectiveWorkingRanges, custom);
}

const DAY_ORDER: Array<{ key: string; label: string }> = [
  { key: '1', label: 'Monday' },
  { key: '2', label: 'Tuesday' },
  { key: '3', label: 'Wednesday' },
  { key: '4', label: 'Thursday' },
  { key: '5', label: 'Friday' },
  { key: '6', label: 'Saturday' },
  { key: '0', label: 'Sunday' },
];

/** Human-readable summary for UI (custom schedule). */
export function formatWorkingHoursSummary(wh: WorkingHours | null | undefined): string {
  if (!wh || typeof wh !== 'object') return 'No custom hours set.';
  const parts: string[] = [];
  for (const { key, label } of DAY_ORDER) {
    const ranges = wh[key];
    if (!ranges?.length) continue;
    const seg = ranges.map((r) => `${r.start}–${r.end}`).join(', ');
    parts.push(`${label}: ${seg}`);
  }
  return parts.length > 0 ? parts.join(' · ') : 'Closed every day.';
}

export function parseCustomWorkingHoursFromDb(raw: unknown): WorkingHours | null {
  if (raw == null) return null;
  if (typeof raw !== 'object' || Array.isArray(raw)) return null;
  const out: WorkingHours = {};
  for (const [k, v] of Object.entries(raw)) {
    if (!Array.isArray(v)) continue;
    const ranges: { start: string; end: string }[] = [];
    for (const item of v) {
      if (!item || typeof item !== 'object') continue;
      const start = typeof (item as { start?: unknown }).start === 'string' ? (item as { start: string }).start : '';
      const end = typeof (item as { end?: unknown }).end === 'string' ? (item as { end: string }).end : '';
      if (start && end) ranges.push({ start: start.slice(0, 5), end: end.slice(0, 5) });
    }
    if (ranges.length > 0) out[k] = ranges;
  }
  return Object.keys(out).length > 0 ? out : null;
}

function isVenueOpeningHoursConfigured(openingHours: OpeningHours | null | undefined): boolean {
  return openingHours != null && typeof openingHours === 'object' && Object.keys(openingHours).length > 0;
}

function venueMinuteRangesForDay(
  venueOpeningHours: OpeningHours | null | undefined,
  dow: number,
): Array<{ start: number; end: number }> | null {
  if (!isVenueOpeningHoursConfigured(venueOpeningHours)) return null;
  const periods = getOpeningPeriodsForDay(venueOpeningHours, dow);
  if (periods.length === 0) return [];
  return periods.map((p) => ({
    start: timeToMinutes(p.open.slice(0, 5)),
    end: timeToMinutes(p.close.slice(0, 5)),
  }));
}

function minuteRangesForWorkingHoursDay(
  wh: WorkingHours | null | undefined,
  dow: number,
): Array<{ start: number; end: number }> {
  if (!wh || typeof wh !== 'object') return [];
  const key = String(dow);
  const dayName = DAY_NAMES[dow];
  const ranges = wh[key] ?? wh[dayName];
  if (!ranges || !Array.isArray(ranges) || ranges.length === 0) return [];
  return ranges.map((r) => ({
    start: timeToMinutes(String(r.start).slice(0, 5)),
    end: timeToMinutes(String(r.end).slice(0, 5)),
  }));
}

function mergeUnionRanges(ranges: Array<{ start: number; end: number }>): Array<{ start: number; end: number }> {
  if (ranges.length === 0) return [];
  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  const out: Array<{ start: number; end: number }> = [];
  let cur = { ...sorted[0]! };
  for (let i = 1; i < sorted.length; i++) {
    const r = sorted[i]!;
    if (r.start <= cur.end) {
      cur.end = Math.max(cur.end, r.end);
    } else {
      out.push(cur);
      cur = { ...r };
    }
  }
  out.push(cur);
  return out;
}

/**
 * Typical week of clock windows when online appointment slots may appear (venue + linked calendars, then optional
 * per-service custom hours). Union across calendars = a guest can book someone offering this service that day.
 */
export function describeOnlineBookableWeeklySummary(params: {
  venueOpeningHours: OpeningHours | null | undefined;
  linkedCalendars: Array<{ id: string; working_hours: WorkingHours | null | undefined }>;
  customAvailabilityEnabled: boolean;
  customWorkingHours: WorkingHours | null | undefined;
}): string {
  const { venueOpeningHours, linkedCalendars, customAvailabilityEnabled, customWorkingHours } = params;
  if (linkedCalendars.length === 0) {
    return 'Link at least one calendar to this service to see bookable times.';
  }

  const lines: string[] = [];
  for (const { key, label } of DAY_ORDER) {
    const dow = parseInt(key, 10);
    const venueRanges = venueMinuteRangesForDay(venueOpeningHours, dow);
    const all: Array<{ start: number; end: number }> = [];
    for (const cal of linkedCalendars) {
      const calRanges = minuteRangesForWorkingHoursDay(cal.working_hours, dow);
      if (calRanges.length === 0) continue;
      const eff = venueRanges === null ? calRanges : intersectMinuteRanges(calRanges, venueRanges);
      all.push(...eff);
    }
    let union = mergeUnionRanges(all);
    if (customAvailabilityEnabled && customWorkingHours) {
      const customRanges = minuteRangesForWorkingHoursDay(customWorkingHours, dow);
      if (customRanges.length === 0) {
        union = [];
      } else {
        union = intersectMinuteRanges(union, customRanges);
      }
    }
    if (union.length === 0) {
      lines.push(`${label}: Closed`);
    } else {
      const segs = union.map((r) => `${minutesToTime(r.start)}–${minutesToTime(r.end)}`).join(', ');
      lines.push(`${label}: ${segs}`);
    }
  }
  return lines.join('\n');
}
