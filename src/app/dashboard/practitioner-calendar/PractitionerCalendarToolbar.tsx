'use client';

import type { ReactNode } from 'react';
import { CalendarDateTimePicker } from '@/components/calendar/CalendarDateTimePicker';

export type CalendarToolbarViewMode = 'day' | 'week' | 'month';

export interface PractitionerCalendarToolbarProps {
  viewMode: CalendarToolbarViewMode;
  onViewModeChange: (m: CalendarToolbarViewMode) => void;
  onNavigateDay: (delta: 1 | -1) => void;
  onDateChange: (date: string) => void;
  date: string;
  weekStart: string;
  monthAnchor: string;
  startHour: number;
  endHour: number;
  onTimeRangeChange: (start: number, end: number) => void;
  /** Filters, actions, and stats — same row as day/week/month (wraps on small screens). */
  toolbarExtension?: ReactNode;
}

const WEEKDAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
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
 * Calendar toolbar. Day view uses CalendarDateTimePicker (scrollable date strip + dropdowns).
 * Week/month views use the classic chevron nav.
 */
export function PractitionerCalendarToolbar({
  viewMode,
  onViewModeChange,
  onNavigateDay,
  onDateChange,
  date,
  weekStart,
  monthAnchor,
  startHour,
  endHour,
  onTimeRangeChange,
  toolbarExtension,
}: PractitionerCalendarToolbarProps) {
  const periodLabel = formatCalendarPeriodLabel(viewMode, date, weekStart, monthAnchor);
  const showTodayBadge = isPeriodContainingToday(viewMode, date, weekStart, monthAnchor);

  return (
    <div className="space-y-3">
      <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">Calendar</h1>

      <div className="flex w-full flex-wrap items-center gap-x-3 gap-y-2">
        <div className="shrink-0 overflow-x-auto">
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
        {toolbarExtension}
      </div>

      {/* Day view: full date/time picker with scrollable strip */}
      {viewMode === 'day' && (
        <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          <CalendarDateTimePicker
            date={date}
            onDateChange={onDateChange}
            startHour={startHour}
            endHour={endHour}
            onTimeRangeChange={onTimeRangeChange}
          />
        </div>
      )}

      {/* Week / month view: classic chevron period nav */}
      {viewMode !== 'day' && (
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
      )}
    </div>
  );
}
