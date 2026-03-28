import type { OpeningHours, OpeningHoursPeriod } from '@/types/availability';

function timeToMinutesHM(t: string): number {
  const [h, m] = t.slice(0, 5).split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
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

/**
 * Calendar grid vertical range from venue opening_hours for one date.
 * Falls back to 07:00–21:00 when closed or missing.
 */
export function getCalendarGridBounds(
  dateStr: string,
  openingHours: OpeningHours | null | undefined,
  fallbackStart = 7,
  fallbackEnd = 21,
): { startHour: number; endHour: number } {
  if (!openingHours || Object.keys(openingHours).length === 0) {
    return { startHour: fallbackStart, endHour: fallbackEnd };
  }
  const key = utcWeekdayKey(dateStr);
  const day = openingHours[key];
  const periods = periodsForDay(day);
  if (periods.length === 0) {
    return { startHour: fallbackStart, endHour: fallbackEnd };
  }
  let minM = Infinity;
  let maxM = 0;
  for (const p of periods) {
    minM = Math.min(minM, timeToMinutesHM(p.open));
    maxM = Math.max(maxM, timeToMinutesHM(p.close));
  }
  if (!Number.isFinite(minM)) {
    return { startHour: fallbackStart, endHour: fallbackEnd };
  }
  const startHour = Math.max(0, Math.floor(minM / 60));
  let endHour = Math.ceil(maxM / 60);
  if (endHour <= startHour) endHour = startHour + 1;
  endHour = Math.min(24, Math.max(endHour, startHour + 1));
  return { startHour, endHour };
}
