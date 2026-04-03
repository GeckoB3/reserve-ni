import { MAX_MATERIALISED_EVENT_OCCURRENCES } from '@/lib/scheduling/cde-scheduling-rules';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseUtcDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!));
}

function formatUtcDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Weekly occurrences from `startDate` (inclusive) through `untilDate` (inclusive), same weekday as start.
 */
export function expandWeeklyOccurrences(startDate: string, untilDate: string): string[] {
  if (!DATE_RE.test(startDate) || !DATE_RE.test(untilDate)) return [];
  const start = parseUtcDate(startDate);
  const end = parseUtcDate(untilDate);
  if (end < start) return [];

  const out: string[] = [];
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 7)) {
    out.push(formatUtcDate(d));
    if (out.length >= MAX_MATERIALISED_EVENT_OCCURRENCES) break;
  }
  return out;
}

/** Deduplicate and sort ISO date strings. */
export function normaliseCustomDates(dates: string[]): string[] {
  const set = new Set<string>();
  for (const s of dates) {
    const t = s.trim();
    if (DATE_RE.test(t)) set.add(t);
  }
  return [...set].sort();
}
