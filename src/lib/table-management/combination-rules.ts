import type { BookingModel } from '@/types/booking-models';

/** Stored as 1=Mon … 7=Sun (matches migration default array). */
export const ALL_DAYS_OF_WEEK = [1, 2, 3, 4, 5, 6, 7] as const;

export interface CombinationRuleLike {
  days_of_week: number[];
  time_start: string | null;
  time_end: string | null;
  booking_type_filters: string[] | null;
  requires_manager_approval: boolean;
  internal_notes?: string | null;
}

export function tableGroupKeyFromIds(tableIds: string[]): string {
  return [...tableIds].sort().join('|');
}

/** Parse a stored `table_group_key` back into sorted table ids. */
export function tableGroupIdsFromKey(tableGroupKey: string): string[] {
  return tableGroupKey
    .split('|')
    .map((id) => id.trim())
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
}

/** ISO weekday 1=Mon … 7=Sun from a YYYY-MM-DD date string (local). */
export function isoWeekdayFromDateString(dateStr: string): number {
  const d = new Date(`${dateStr}T12:00:00`);
  const sun0 = d.getDay();
  return sun0 === 0 ? 7 : sun0;
}

function timeStrToMinutes(hhmm: string): number {
  const [h, m] = hhmm.slice(0, 5).split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/**
 * Whether a combination rule allows this booking context.
 * Empty/null booking_type_filters = all types.
 */
export function isCombinationAllowedForBookingContext(
  rule: CombinationRuleLike,
  ctx: {
    bookingDate: string;
    bookingTime: string;
    bookingModel: BookingModel;
  },
): boolean {
  const dow = isoWeekdayFromDateString(ctx.bookingDate);
  if (!rule.days_of_week.includes(dow)) return false;

  const filters = rule.booking_type_filters;
  if (filters && filters.length > 0 && !filters.includes(ctx.bookingModel)) {
    return false;
  }

  const start = rule.time_start;
  const end = rule.time_end;
  if (!start && !end) return true;
  if (start && end) {
    const t = timeStrToMinutes(ctx.bookingTime.slice(0, 5));
    const s = timeStrToMinutes(start.slice(0, 5));
    const e = timeStrToMinutes(end.slice(0, 5));
    if (t < s || t >= e) return false;
  }

  return true;
}
