'use client';

import { eachDayOfInterval, format, parseISO } from 'date-fns';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

export function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function ymdFromParts(year: number, month: number, day: number): string {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

/** Inclusive ISO date range → set of YYYY-MM-DD (empty if invalid). */
export function isoDateRangeToSet(start: string, end: string): Set<string> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) return new Set();
  const lo = start <= end ? start : end;
  const hi = start <= end ? end : start;
  try {
    const days = eachDayOfInterval({ start: parseISO(lo), end: parseISO(hi) });
    return new Set(days.map((d) => format(d, 'yyyy-MM-dd')));
  } catch {
    return new Set();
  }
}

export type DayVisualState =
  | 'default'
  | 'today'
  | 'in-range'
  | 'has-entry'
  | 'selected-entry'
  | 'range-endpoint';

export function ServiceAvailabilityMonthGrid({
  year,
  month,
  todayYmd,
  onPrevMonth,
  onNextMonth,
  getDayState,
  onDayClick,
  disabled = false,
  footerHint,
  subtitle = 'Use the grid below',
}: {
  year: number;
  month: number;
  todayYmd: string;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  getDayState: (ymd: string) => DayVisualState;
  onDayClick?: (ymd: string) => void;
  disabled?: boolean;
  footerHint?: string;
  subtitle?: string;
}) {
  const first = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0).getDate();
  const leading = (first.getDay() + 6) % 7;
  const cells: Array<number | null> = [];
  for (let i = 0; i < leading; i++) cells.push(null);
  for (let d = 1; d <= lastDay; d++) cells.push(d);

  const title = `${MONTH_NAMES[month - 1]} ${year}`;

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-gradient-to-b from-white via-white to-slate-50/40 shadow-sm">
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/80 px-3 py-2.5">
        <button
          type="button"
          onClick={onPrevMonth}
          disabled={disabled}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 disabled:opacity-40"
          aria-label="Previous month"
        >
          <span className="text-lg leading-none" aria-hidden>
            ‹
          </span>
        </button>
        <div className="min-w-0 text-center">
          <div className="text-sm font-semibold tracking-tight text-slate-900">{title}</div>
          <div className="text-[11px] font-medium text-slate-500">{subtitle}</div>
        </div>
        <button
          type="button"
          onClick={onNextMonth}
          disabled={disabled}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 disabled:opacity-40"
          aria-label="Next month"
        >
          <span className="text-lg leading-none" aria-hidden>
            ›
          </span>
        </button>
      </div>

      <div className="p-3">
        <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-semibold uppercase tracking-wider text-slate-400">
          {WEEKDAYS.map((w) => (
            <div key={w} className="py-1.5">
              {w}
            </div>
          ))}
        </div>

        <div className="mt-1 grid grid-cols-7 gap-1.5">
          {cells.map((d, idx) => {
            if (d === null) {
              return <div key={`e-${idx}`} className="aspect-square min-h-[2.25rem]" aria-hidden />;
            }
            const ymd = ymdFromParts(year, month, d);
            const state = getDayState(ymd);
            const effectiveToday = state === 'today' || ymd === todayYmd;

            let cell =
              'flex aspect-square min-h-[2.25rem] items-center justify-center rounded-xl text-sm font-semibold transition-all duration-150 ';
            if (disabled) {
              cell += 'cursor-not-allowed text-slate-300 ';
            } else if (onDayClick) {
              cell += 'cursor-pointer active:scale-95 ';
            } else {
              cell += 'cursor-default ';
            }

            if (state === 'selected-entry') {
              cell +=
                'bg-brand-600 text-white shadow-md shadow-brand-600/25 ring-2 ring-brand-500/30 ring-offset-2 ring-offset-white ';
            } else if (state === 'range-endpoint') {
              cell +=
                'bg-brand-600 text-white shadow-md shadow-brand-600/20 ring-2 ring-brand-400/40 ring-offset-1 ring-offset-white ';
            } else if (state === 'has-entry') {
              cell += 'bg-brand-100 text-brand-900 ring-1 ring-brand-200 hover:bg-brand-200/80 ';
            } else if (state === 'in-range') {
              cell += 'bg-brand-50 text-brand-900 ring-1 ring-brand-100 hover:bg-brand-100 ';
            } else if (effectiveToday) {
              cell += 'bg-white text-slate-900 ring-2 ring-brand-300/80 hover:bg-slate-50 ';
            } else {
              cell += 'bg-white text-slate-700 ring-1 ring-slate-100 hover:bg-slate-50 hover:ring-slate-200 ';
            }

            return (
              <button
                key={ymd}
                type="button"
                disabled={disabled || !onDayClick}
                onClick={() => onDayClick?.(ymd)}
                className={cell}
                aria-label={`${ymd}${state === 'selected-entry' ? ', selected' : ''}`}
                aria-pressed={state === 'selected-entry' || state === 'range-endpoint'}
              >
                {d}
              </button>
            );
          })}
        </div>

        {footerHint ? <p className="mt-3 text-center text-[11px] leading-relaxed text-slate-500">{footerHint}</p> : null}
      </div>
    </div>
  );
}
