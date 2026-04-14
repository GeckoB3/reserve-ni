import { getDayOfWeekForYmdInTimezone } from '@/lib/venue/venue-local-clock';
import type { TimeRange, WorkingHours } from '@/types/booking-models';

const LEGACY_DAY_NAME_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

function periodsForCalendarDay(wh: WorkingHours, dow: number): TimeRange[] | undefined {
  const numeric = wh[String(dow)];
  if (Array.isArray(numeric) && numeric.length > 0) return numeric;
  const legacy = wh[LEGACY_DAY_NAME_KEYS[dow] as string];
  if (Array.isArray(legacy) && legacy.length > 0) return legacy;
  return undefined;
}

/**
 * Human-readable working hours for one calendar column on a given civil date (venue timezone).
 * Uses practitioner / unified calendar `working_hours` (Settings → Calendar availability).
 */
export function formatWorkingHoursLineForDate(
  workingHours: WorkingHours | null | undefined,
  dateYmd: string,
  timeZone: string,
): string {
  const wh = workingHours ?? {};
  const dow = getDayOfWeekForYmdInTimezone(dateYmd, timeZone);
  const periods = periodsForCalendarDay(wh, dow);
  if (!periods || periods.length === 0) return 'Closed';
  const parts = periods
    .map((p) => {
      const s = (p.start ?? '').trim().slice(0, 5);
      const e = (p.end ?? '').trim().slice(0, 5);
      if (!s || !e) return '';
      return `${s}–${e}`;
    })
    .filter(Boolean);
  return parts.length > 0 ? parts.join(', ') : 'Closed';
}
