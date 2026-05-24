'use client';

import { Skeleton } from '@/components/ui/Skeleton';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
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
];

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** Today in local timezone as YYYY-MM-DD. */
export function todayYmdLocal(): string {
  const t = new Date();
  return `${t.getFullYear()}-${pad2(t.getMonth() + 1)}-${pad2(t.getDate())}`;
}

const NAV_BTN_BASE =
  'min-h-10 min-w-10 shrink-0 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2';
const NAV_BTN_PUBLIC = 'ap-calendar-nav shrink-0 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors';

export function ResourceCalendarMonth({
  year,
  month,
  availableDates,
  selectedDate,
  onSelectDate,
  onPrevMonth,
  onNextMonth,
  minSelectableDate,
  loading = false,
  accentPublic = false,
}: {
  year: number;
  month: number;
  availableDates: Set<string>;
  selectedDate: string | null;
  onSelectDate: (ymd: string) => void;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  /** First date users may book (inclusive), YYYY-MM-DD. */
  minSelectableDate: string;
  loading?: boolean;
  /** When true, nav/selection use appointment-public accent classes. */
  accentPublic?: boolean;
}) {
  const first = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0).getDate();
  const leading = (first.getDay() + 6) % 7;
  const cells: Array<number | null> = [];
  for (let i = 0; i < leading; i++) cells.push(null);
  for (let d = 1; d <= lastDay; d++) cells.push(d);

  const title = `${MONTH_NAMES[month - 1]} ${year}`;
  const navClass = accentPublic ? NAV_BTN_PUBLIC : NAV_BTN_BASE;

  return (
    <div
      className="relative min-w-0 max-w-full rounded-xl border border-slate-200 bg-white p-2.5 shadow-sm sm:p-4"
      aria-busy={loading}
    >
      <div className="mb-3 flex min-w-0 items-center justify-between gap-2">
        <button type="button" onClick={onPrevMonth} className={navClass} aria-label="Previous month">
          ←
        </button>
        <div className="min-w-0 truncate text-center text-sm font-semibold tracking-tight text-slate-900">{title}</div>
        <button type="button" onClick={onNextMonth} className={navClass} aria-label="Next month">
          →
        </button>
      </div>

      <div className="grid min-w-0 grid-cols-7 gap-1 text-center text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        {WEEKDAYS.map((w) => (
          <div key={w} className="py-1">
            {w}
          </div>
        ))}
      </div>

      <div className="relative mt-1">
        <div
          className={`grid min-w-0 grid-cols-7 gap-1 auto-rows-[minmax(2.5rem,auto)] transition-opacity ${loading ? 'pointer-events-none opacity-40' : ''}`}
        >
          {cells.map((d, idx) => {
            if (d === null) {
              return <div key={`e-${idx}`} className="min-h-[2.5rem]" aria-hidden />;
            }
            const ymd = `${year}-${pad2(month)}-${pad2(d)}`;
            const isPast = ymd < minSelectableDate;
            const hasAvail = availableDates.has(ymd);
            const isSelected = selectedDate === ymd;
            const disabled = isPast || !hasAvail;

            let cellClass =
              'flex min-h-[2.5rem] min-w-0 items-center justify-center rounded-lg text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1 sm:min-h-[2.75rem] ';
            if (disabled) {
              cellClass += isPast
                ? 'cursor-not-allowed text-slate-300 '
                : 'cursor-not-allowed bg-slate-50 text-slate-400 ';
            } else if (isSelected) {
              cellClass += accentPublic
                ? 'ap-cal-day-selected cursor-pointer '
                : 'cursor-pointer bg-slate-800 text-white shadow-sm ring-2 ring-slate-800 ring-offset-1 ';
            } else if (hasAvail) {
              cellClass +=
                'cursor-pointer bg-emerald-50 text-emerald-900 ring-1 ring-emerald-300 hover:bg-emerald-100 ';
            } else {
              cellClass += 'text-slate-400 ';
            }

            return (
              <button
                key={ymd}
                type="button"
                disabled={disabled}
                onClick={() => {
                  if (!disabled) onSelectDate(ymd);
                }}
                className={cellClass}
                aria-label={`${ymd}${hasAvail && !isPast ? ', has availability' : ''}${isSelected ? ', selected' : ''}`}
                aria-pressed={isSelected}
              >
                {d}
              </button>
            );
          })}
        </div>

        {loading ? (
          <div
            className="absolute inset-0 flex items-center justify-center rounded-lg bg-white/60"
            role="status"
            aria-label="Loading availability"
          >
            <div className="w-full space-y-2 px-2">
              <Skeleton.Line className="mx-auto w-1/2" />
              <Skeleton.Block className="h-24" />
            </div>
          </div>
        ) : null}
      </div>

      <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-emerald-400 ring-1 ring-emerald-300" aria-hidden />
          Has availability
        </span>
        {!loading && availableDates.size === 0 ? (
          <span className="text-slate-400">No bookable days this month — try another month.</span>
        ) : null}
      </p>
    </div>
  );
}
