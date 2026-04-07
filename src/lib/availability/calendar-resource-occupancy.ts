/**
 * Shared minute-range helpers for host calendar vs resource scheduling.
 */

import { timeToMinutes } from '@/lib/availability';

/** Merge overlapping / adjacent minute ranges into a minimal union. */
export function unionMinuteRanges(ranges: Array<{ start: number; end: number }>): Array<{ start: number; end: number }> {
  const filtered = ranges.filter((r) => r.end > r.start && Number.isFinite(r.start) && Number.isFinite(r.end));
  if (filtered.length === 0) return [];
  filtered.sort((a, b) => a.start - b.start);
  const out: Array<{ start: number; end: number }> = [];
  let cur = { ...filtered[0]! };
  for (let i = 1; i < filtered.length; i++) {
    const r = filtered[i]!;
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

/** End minute for a booking row (guest / staff). */
export function bookingRowEndMinutes(row: {
  booking_time: string;
  booking_end_time?: string | null;
  estimated_end_time?: string | null;
}): number {
  const start = timeToMinutes(String(row.booking_time).slice(0, 5));
  if (row.booking_end_time) {
    return timeToMinutes(String(row.booking_end_time).slice(0, 5));
  }
  if (row.estimated_end_time) {
    const t = String(row.estimated_end_time);
    const tPart = t.includes('T') ? (t.split('T')[1] ?? t) : t;
    const hm = tPart.slice(0, 5);
    if (/^\d{2}:\d{2}$/.test(hm)) {
      return timeToMinutes(hm);
    }
  }
  return start + 60;
}
