/**
 * Pure helpers for dashboard "dining load": overlapping covers in time vs venue concurrent cap.
 */

import type { AvailabilityConfig, FixedIntervalsConfig, NamedSittingsConfig, OpeningHours } from '@/types/availability';
import { getDayOfWeek, timeToMinutes } from '@/lib/availability';

/** Bookings that count toward expected in-venue load (matches day-sheet timeline). */
export const DASHBOARD_LOAD_STATUSES = ['Pending', 'Confirmed', 'Seated'] as const;

export interface DashboardLoadBooking {
  booking_time: string;
  party_size: number;
  status: string;
  /** ISO timestamp or time string; optional */
  estimated_end_time?: string | null;
}

function isFixed(c: AvailabilityConfig): c is FixedIntervalsConfig {
  return c.model === 'fixed_intervals';
}

function isNamed(c: AvailabilityConfig): c is NamedSittingsConfig {
  return c.model === 'named_sittings';
}

interface OpeningHoursShape {
  [day: string]: {
    closed?: boolean;
    open?: string;
    close?: string;
    periods?: Array<{ open: string; close: string }>;
  };
}

/**
 * Union of opening periods for a weekday key "0".."6" → earliest open to latest close (minutes).
 */
export function resolveOpeningWindowMinutes(
  openingHours: OpeningHours | null | undefined,
  dayOfWeek: number,
): { startMin: number; endMin: number } | null {
  if (!openingHours) return null;
  const dh = (openingHours as OpeningHoursShape)[String(dayOfWeek)];
  if (!dh || dh.closed) return null;

  const periods: Array<{ open: string; close: string }> = [];
  if (Array.isArray(dh.periods)) {
    periods.push(...dh.periods);
  } else if (dh.open && dh.close) {
    periods.push({ open: dh.open, close: dh.close });
  }
  if (periods.length === 0) return null;

  let startMin = 24 * 60;
  let endMin = 0;
  for (const p of periods) {
    const s = timeToMinutes(p.open);
    let e = timeToMinutes(p.close);
    if (e <= s) e = s + 60;
    startMin = Math.min(startMin, s);
    endMin = Math.max(endMin, e);
  }
  if (startMin >= endMin) return null;
  return { startMin, endMin };
}

/**
 * Max covers that can be in the house at once from legacy JSONB config (fixed or named sittings).
 * Returns null if not configured or service-only mode (caller resolves service cap separately).
 */
export function resolveVenueConcurrentCapLegacy(
  config: AvailabilityConfig | null | undefined,
  dateStr: string,
): number | null {
  if (!config) return null;
  const dayNum = getDayOfWeek(dateStr);
  if (isFixed(config)) {
    return config.max_covers_by_day?.[String(dayNum)] ?? null;
  }
  if (isNamed(config) && config.sittings.length > 0) {
    return Math.max(...config.sittings.map((sit) => sit.max_covers));
  }
  return null;
}

function bookingEndMinutes(b: DashboardLoadBooking, defaultDurationMinutes: number): number {
  const start = timeToMinutes(b.booking_time);
  const raw = b.estimated_end_time;
  if (raw && typeof raw === 'string' && raw.trim()) {
    const t = raw.includes('T') ? raw.split('T')[1] ?? raw : raw;
    const hm = t.slice(0, 5);
    if (/^\d{2}:\d{2}$/.test(hm)) {
      const end = timeToMinutes(hm);
      return end > start ? end : start + defaultDurationMinutes;
    }
  }
  return start + defaultDurationMinutes;
}

function countsTowardLoad(status: string): boolean {
  return (DASHBOARD_LOAD_STATUSES as readonly string[]).includes(status);
}

/**
 * Sum party_size for bookings overlapping [windowStart, windowEnd) (half-open on end for slot stepping).
 */
export function coversOverlappingWindow(
  bookings: DashboardLoadBooking[],
  windowStartMin: number,
  windowEndMin: number,
  defaultDurationMinutes: number,
): number {
  let total = 0;
  for (const b of bookings) {
    if (!countsTowardLoad(b.status)) continue;
    const bStart = timeToMinutes(b.booking_time);
    const bEnd = bookingEndMinutes(b, defaultDurationMinutes);
    if (bStart < windowEndMin && bEnd > windowStartMin) {
      total += b.party_size;
    }
  }
  return total;
}

export interface PeakLoadOptions {
  /** Inclusive start minute (e.g. 17*60). */
  earliestMin: number;
  /** Exclusive end minute (e.g. 23*60). */
  latestMin: number;
  stepMinutes: number;
  defaultDurationMinutes: number;
}

export function peakOverlappingCovers(
  bookings: DashboardLoadBooking[],
  options: PeakLoadOptions,
): number {
  const { earliestMin, latestMin, stepMinutes, defaultDurationMinutes } = options;
  if (latestMin <= earliestMin || stepMinutes <= 0) return 0;
  let peak = 0;
  for (let m = earliestMin; m < latestMin; m += stepMinutes) {
    const c = coversOverlappingWindow(bookings, m, m + stepMinutes, defaultDurationMinutes);
    if (c > peak) peak = c;
  }
  return peak;
}

/** Covers overlapping the instant `atMinutes` (treat as a 1-minute probe window). */
export function coversOverlappingNow(
  bookings: DashboardLoadBooking[],
  atMinutes: number,
  defaultDurationMinutes: number,
): number {
  return coversOverlappingWindow(bookings, atMinutes, atMinutes + 1, defaultDurationMinutes);
}

/** Party sizes for bookings starting in (nowMin, nowMin + withinMinutes]. */
export function coversArrivingWithin(
  bookings: DashboardLoadBooking[],
  nowMinutes: number,
  withinMinutes: number,
  defaultDurationMinutes: number,
): number {
  const end = nowMinutes + withinMinutes;
  let total = 0;
  for (const b of bookings) {
    if (!countsTowardLoad(b.status)) continue;
    if (b.status === 'Seated') continue;
    const bStart = timeToMinutes(b.booking_time);
    if (bStart > nowMinutes && bStart <= end) {
      total += b.party_size;
    }
  }
  return total;
}
