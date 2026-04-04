'use client';

export type CalendarToolbarViewMode = 'day' | 'week' | 'month';

export interface PractitionerCalendarToolbarProps {
  viewMode: CalendarToolbarViewMode;
  onViewModeChange: (m: CalendarToolbarViewMode) => void;
  onNavigateDay: (delta: 1 | -1) => void;
  onGoToday: () => void;
  date: string;
  onDateChange: (dateStr: string) => void;
}

/**
 * Top row: title, day/week/month, prev/today/next, date picker.
 */
export function PractitionerCalendarToolbar({
  viewMode,
  onViewModeChange,
  onNavigateDay,
  onGoToday,
  date,
  onDateChange,
}: PractitionerCalendarToolbarProps) {
  const showDateInput = viewMode === 'day';

  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-semibold text-slate-900 sm:text-2xl">Calendar</h1>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border border-slate-200 p-0.5 text-xs font-medium">
          {(['day', 'week', 'month'] as const).map((m) => (
            <button
              key={m}
              type="button"
              aria-label={`${m} schedule view`}
              aria-pressed={viewMode === m}
              onClick={() => onViewModeChange(m)}
              className={`rounded-md px-2.5 py-1 capitalize ${
                viewMode === m ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              {m}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => onNavigateDay(-1)}
          className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm hover:bg-slate-50"
        >
          &larr;
        </button>
        <button
          type="button"
          onClick={onGoToday}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium hover:bg-slate-50"
        >
          Today
        </button>
        <button
          type="button"
          onClick={() => onNavigateDay(1)}
          className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm hover:bg-slate-50"
        >
          &rarr;
        </button>
        {showDateInput && (
          <input
            type="date"
            value={date}
            onChange={(e) => onDateChange(e.target.value)}
            className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
          />
        )}
      </div>
    </div>
  );
}
