import type { OpeningHours, OpeningHoursPeriod } from '@/types/availability';
import { getDayOfWeekForYmdInTimezone } from '@/lib/venue/venue-local-clock';

function timeToMinutesHM(t: string): number {
  if (typeof t !== 'string' || t.trim() === '') return NaN;
  const [h, m] = t.slice(0, 5).split(':').map(Number);
  const hh = h ?? 0;
  const mm = m ?? 0;
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return NaN;
  return hh * 60 + mm;
}

/** UTC weekday 0–6 for YYYY-MM-DD (aligned with appointment engine). */
export function utcWeekdayKey(dateStr: string): string {
  const [y, mo, d] = dateStr.split('-').map(Number);
  return String(new Date(Date.UTC(y!, mo! - 1, d!)).getUTCDay());
}

function periodsForDay(day: OpeningHours[keyof OpeningHours] | undefined): OpeningHoursPeriod[] {
  if (!day || typeof day !== 'object') return [];
  const d = day as Record<string, unknown>;
  if (d.closed === true) return [];
  if (Array.isArray(d.periods)) return d.periods as OpeningHoursPeriod[];
  if (typeof d.open === 'string' && typeof d.close === 'string') {
    return [{ open: d.open, close: d.close }];
  }
  return [];
}

export interface CalendarGridBoundsOptions {
  /** IANA timezone (e.g. Europe/London). When set, weekday matches Settings → Business Hours for that civil date. */
  timeZone?: string | null;
}

/**
 * Calendar grid vertical range from venue opening_hours for one date.
 * Falls back to 07:00–21:00 when closed or missing.
 */
export function getCalendarGridBounds(
  dateStr: string,
  openingHours: OpeningHours | null | undefined,
  fallbackStart = 7,
  fallbackEnd = 21,
  options?: CalendarGridBoundsOptions,
): { startHour: number; endHour: number } {
  if (!openingHours || Object.keys(openingHours).length === 0) {
    return { startHour: fallbackStart, endHour: fallbackEnd };
  }
  const tz = options?.timeZone?.trim();
  const key = tz
    ? String(getDayOfWeekForYmdInTimezone(dateStr, tz))
    : utcWeekdayKey(dateStr);
  const day = openingHours[key];
  const periods = periodsForDay(day);
  if (periods.length === 0) {
    return { startHour: fallbackStart, endHour: fallbackEnd };
  }
  let minM = Infinity;
  let maxM = -Infinity;
  for (const p of periods) {
    if (typeof p.open !== 'string' || typeof p.close !== 'string') continue;
    const openM = timeToMinutesHM(p.open);
    const closeM = timeToMinutesHM(p.close);
    if (!Number.isFinite(openM) || !Number.isFinite(closeM)) continue;
    minM = Math.min(minM, openM);
    maxM = Math.max(maxM, closeM);
  }
  if (!Number.isFinite(minM) || minM === Infinity || !Number.isFinite(maxM) || maxM === -Infinity) {
    return { startHour: fallbackStart, endHour: fallbackEnd };
  }
  if (maxM < minM) {
    return { startHour: fallbackStart, endHour: fallbackEnd };
  }
  const startHour = Math.max(0, Math.floor(minM / 60));
  let endHour = Math.ceil(maxM / 60);
  if (endHour <= startHour) endHour = startHour + 1;
  endHour = Math.min(24, Math.max(endHour, startHour + 1));
  return { startHour, endHour };
}
