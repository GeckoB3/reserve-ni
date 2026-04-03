'use client';

export type CalendarToolbarViewMode = 'day' | 'week' | 'month';

export interface PractitionerCalendarToolbarProps {
  resourceScheduleEnabled: boolean;
  scheduleKind: 'appointments' | 'resources';
  onScheduleKindChange: (k: 'appointments' | 'resources') => void;
  viewMode: CalendarToolbarViewMode;
  onViewModeChange: (m: CalendarToolbarViewMode) => void;
  onNavigateDay: (delta: 1 | -1) => void;
  onGoToday: () => void;
  date: string;
  onDateChange: (dateStr: string) => void;
}

/**
 * Top row: title, appointments/resources toggle, day/week/month, prev/today/next, date picker.
 * Extracted from PractitionerCalendarView to keep the main component smaller.
 */
export function PractitionerCalendarToolbar({
  resourceScheduleEnabled,
  scheduleKind,
  onScheduleKindChange,
  viewMode,
  onViewModeChange,
  onNavigateDay,
  onGoToday,
  date,
  onDateChange,
}: PractitionerCalendarToolbarProps) {
  const showDateInput = scheduleKind === 'resources' || viewMode === 'day';

  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-semibold text-slate-900 sm:text-2xl">Calendar</h1>
        {resourceScheduleEnabled && (
          <div className="flex rounded-lg border border-slate-200 p-0.5 text-xs font-medium">
            <button
              type="button"
              onClick={() => onScheduleKindChange('appointments')}
              className={`rounded-md px-2.5 py-1 ${
                scheduleKind === 'appointments'
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              Appointments
            </button>
            <button
              type="button"
              onClick={() => onScheduleKindChange('resources')}
              className={`rounded-md px-2.5 py-1 ${
                scheduleKind === 'resources' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              Resources
            </button>
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {scheduleKind === 'appointments' && (
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
        )}
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
