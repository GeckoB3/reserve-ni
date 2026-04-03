/**
 * Align bi-weekly (and N-weekly) timetable slots: include `instanceDateStr` only when
 * whole-week count from the timetable row's `created_at` matches the interval.
 */
export function matchesTimetableIntervalWeeks(params: {
  intervalWeeks: number;
  timetableCreatedAt: string;
  instanceDateStr: string;
}): boolean {
  const { intervalWeeks, timetableCreatedAt, instanceDateStr } = params;
  const iw = Math.min(Math.max(intervalWeeks, 1), 8);
  if (iw <= 1) return true;

  const anchorDate = timetableCreatedAt.slice(0, 10);
  const a = utcMondayIndex(anchorDate);
  const b = utcMondayIndex(instanceDateStr);
  const weekDiff = Math.floor((b - a) / 7);
  if (weekDiff < 0) return false;
  return weekDiff % iw === 0;
}

/** Days since Unix epoch for UTC Monday of the given calendar date. */
function utcMondayIndex(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number);
  const t = Date.UTC(y!, m! - 1, d!);
  const wd = new Date(t).getUTCDay();
  const mondayOffset = (wd + 6) % 7;
  return Math.floor((t - mondayOffset * 86400000) / 86400000);
}
