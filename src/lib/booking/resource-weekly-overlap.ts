/**
 * Detect whether two resources' weekly availability windows overlap on any day.
 * Used when assigning multiple resources to the same host calendar column.
 *
 * Also: whether a host calendar's weekly hours are narrower than a resource's
 * (so actual bookable time is a strict subset of the resource row on at least one day).
 */

import type { WorkingHours } from '@/types/booking-models';
import { timeToMinutes } from '@/lib/availability';

const DAY_NAMES = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

function rangesForDow(
  h: WorkingHours,
  dayIndex0to6: number,
): Array<{ start: number; end: number }> {
  const key = String(dayIndex0to6);
  const named = DAY_NAMES[dayIndex0to6];
  const ranges = h[key] ?? h[named];
  if (!ranges?.length) return [];
  return ranges.map((r) => ({
    start: timeToMinutes(r.start),
    end: timeToMinutes(r.end),
  }));
}

export function weeklyResourceAvailabilityOverlaps(a: WorkingHours, b: WorkingHours): boolean {
  for (let d = 0; d < 7; d++) {
    const ra = rangesForDow(a, d);
    const rb = rangesForDow(b, d);
    for (const x of ra) {
      for (const y of rb) {
        if (x.start < y.end && y.start < x.end) return true;
      }
    }
  }
  return false;
}

/**
 * True if `[startMins, endMins)` on `dayIndex0to6` (Sun=0) overlaps any of the resource's weekly ranges that day.
 * Used to block assigning a resource to a host calendar when classes/bookings already occupy those times.
 */
export function intervalOverlapsResourceWeeklyHours(
  resourceHours: WorkingHours,
  dayIndex0to6: number,
  startMins: number,
  endMins: number,
): boolean {
  const ranges = rangesForDow(resourceHours, dayIndex0to6);
  for (const r of ranges) {
    if (r.start < endMins && startMins < r.end) return true;
  }
  return false;
}

function mergeIntervals(ranges: Array<{ start: number; end: number }>): Array<{ start: number; end: number }> {
  if (ranges.length === 0) return [];
  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  const out: Array<{ start: number; end: number }> = [{ ...sorted[0]! }];
  for (let i = 1; i < sorted.length; i++) {
    const cur = sorted[i]!;
    const last = out[out.length - 1]!;
    if (cur.start <= last.end) {
      last.end = Math.max(last.end, cur.end);
    } else {
      out.push({ ...cur });
    }
  }
  return out;
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

/** Subtract a union of merged intervals from `r` (intervals assumed disjoint after merge). */
function subtractRangesFromSingleRange(
  r: { start: number; end: number },
  merged: Array<{ start: number; end: number }>,
): Array<{ start: number; end: number }> {
  let pieces: Array<{ start: number; end: number }> = [{ ...r }];
  for (const cut of merged) {
    const next: typeof pieces = [];
    for (const p of pieces) {
      next.push(...subtractOneRange(p, cut));
    }
    pieces = next;
  }
  return pieces.filter((x) => x.end > x.start);
}

/**
 * True if on any weekday the resource has weekly hours that extend outside the host calendar’s
 * weekly hours (including when the calendar has no hours that day but the resource does).
 */
export function weeklyResourceRestrictedByHostCalendar(
  resourceHours: WorkingHours,
  hostHours: WorkingHours,
): boolean {
  for (let d = 0; d < 7; d++) {
    const R = rangesForDow(resourceHours, d);
    if (R.length === 0) continue;
    const C = rangesForDow(hostHours, d);
    if (C.length === 0) {
      return true;
    }
    const mergedC = mergeIntervals(C);
    for (const r of R) {
      const leftovers = subtractRangesFromSingleRange(r, mergedC);
      if (leftovers.length > 0) return true;
    }
  }
  return false;
}
