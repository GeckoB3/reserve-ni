'use client';

export type CalendarToolbarViewMode = 'day' | 'week' | 'month';

export interface PractitionerCalendarToolbarProps {
  viewMode: CalendarToolbarViewMode;
  onViewModeChange: (m: CalendarToolbarViewMode) => void;
  onNavigateDay: (delta: 1 | -1) => void;
  onGoToday: () => void;
  date: string;
  weekStart: string;
  monthAnchor: string;
}

const WEEKDAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS_LONG = [
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
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDays(date: string, days: number): string {
  const d = new Date(date + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function startOfMonth(date: string): string {
  return `${date.slice(0, 7)}-01`;
}

function formatCalendarPeriodLabel(
  viewMode: CalendarToolbarViewMode,
  date: string,
  weekStart: string,
  monthAnchor: string,
): string {
  if (viewMode === 'day') {
    const d = new Date(date + 'T12:00:00');
    return `${WEEKDAYS_LONG[d.getDay()]} ${d.getDate()} ${MONTHS_LONG[d.getMonth()]} ${d.getFullYear()}`;
  }
  if (viewMode === 'week') {
    const d = new Date(weekStart + 'T12:00:00');
    const end = new Date(addDays(weekStart, 6) + 'T12:00:00');
    return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]} – ${end.getDate()} ${MONTHS_SHORT[end.getMonth()]} ${end.getFullYear()}`;
  }
  const d = new Date(`${startOfMonth(monthAnchor)}T12:00:00`);
  return `${MONTHS_LONG[d.getMonth()]} ${d.getFullYear()}`;
}

function isPeriodContainingToday(
  viewMode: CalendarToolbarViewMode,
  date: string,
  weekStart: string,
  monthAnchor: string,
): boolean {
  const today = todayISO();
  if (viewMode === 'day') return date === today;
  if (viewMode === 'week') return today >= weekStart && today <= addDays(weekStart, 6);
  return today.slice(0, 7) === monthAnchor.slice(0, 7);
}

/**
 * Matches dashboard/bookings: segmented view tabs, Today, and a card row with chevrons + period label.
 */
export function PractitionerCalendarToolbar({
  viewMode,
  onViewModeChange,
  onNavigateDay,
  onGoToday,
  date,
  weekStart,
  monthAnchor,
}: PractitionerCalendarToolbarProps) {
  const periodLabel = formatCalendarPeriodLabel(viewMode, date, weekStart, monthAnchor);
  const showTodayBadge = isPeriodContainingToday(viewMode, date, weekStart, monthAnchor);

  return (
    <div className="space-y-3">
      <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">Calendar</h1>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="overflow-x-auto">
          <div className="flex w-max rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
            {(['day', 'week', 'month'] as const).map((m) => (
              <button
                key={m}
                type="button"
                aria-label={`${m} schedule view`}
                aria-pressed={viewMode === m}
                onClick={() => onViewModeChange(m)}
                className={`rounded-lg px-3 py-2 text-sm font-medium capitalize transition-all sm:px-4 ${
                  viewMode === m ? 'bg-brand-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          <button
            type="button"
            onClick={onGoToday}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 shadow-sm hover:bg-slate-50"
          >
            Today
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-3 shadow-sm sm:px-4">
        <button
          type="button"
          onClick={() => onNavigateDay(-1)}
          className="rounded-lg p-2 text-slate-400 hover:bg-slate-50 hover:text-slate-600"
          aria-label="Previous period"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
          </svg>
        </button>
        <div className="min-w-0 flex-1 px-2 text-center">
          <h2 className="truncate text-sm font-semibold text-slate-900 sm:text-base">{periodLabel}</h2>
          {showTodayBadge && <span className="text-xs font-medium text-brand-600">Today</span>}
        </div>
        <button
          type="button"
          onClick={() => onNavigateDay(1)}
          className="rounded-lg p-2 text-slate-400 hover:bg-slate-50 hover:text-slate-600"
          aria-label="Next period"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
          </svg>
        </button>
      </div>
    </div>
  );
}
