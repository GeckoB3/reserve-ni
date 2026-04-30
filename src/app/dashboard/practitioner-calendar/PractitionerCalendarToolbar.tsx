'use client';

import type { ReactNode } from 'react';
import { CalendarDateTimePicker } from '@/components/calendar/CalendarDateTimePicker';
import { OperationsWorkspaceToolbar } from '@/components/dashboard/OperationsWorkspaceToolbar';
import type { ViewToolbarSummary } from '@/components/dashboard/ViewToolbar';

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
  onRefresh: () => void;
  onNewBooking: () => void;
  onWalkIn: () => void;
  controlsPanel: ReactNode;
  controlsLabel?: string;
  summaryContent: ReactNode;
}

const WEEKDAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

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

/**
 * Calendar toolbar using the shared compact operations chrome.
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
  onRefresh,
  onNewBooking,
  onWalkIn,
  controlsPanel,
  controlsLabel = 'Filter',
  summaryContent,
}: PractitionerCalendarToolbarProps) {
  const periodLabel = formatCalendarPeriodLabel(viewMode, date, weekStart, monthAnchor);
  const toolbarSummary: ViewToolbarSummary = {
    total_covers_booked: 0,
    total_covers_capacity: 0,
    tables_in_use: 0,
    tables_total: 0,
    unassigned_count: 0,
    combos_in_use: 0,
  };

  const viewModeSwitcher = (
    <div className="-mx-1 flex max-w-full items-center gap-1 overflow-x-auto px-1 pb-0.5 [-webkit-overflow-scrolling:touch] sm:mx-0 sm:overflow-visible sm:px-0 sm:pb-0">
      {(['day', 'week', 'month'] as const).map((m) => (
        <button
          key={m}
          type="button"
          aria-label={`${m} schedule view`}
          aria-pressed={viewMode === m}
          onClick={() => onViewModeChange(m)}
          className={`min-h-8 shrink-0 rounded-lg px-3 py-1 text-[11px] font-semibold capitalize transition-all sm:text-xs ${
            viewMode === m
              ? 'bg-brand-600 text-white shadow-sm shadow-brand-900/20 ring-1 ring-brand-600'
              : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
          }`}
        >
          {m}
        </button>
      ))}
    </div>
  );

  const datePickerPanel = (
    <div className="rounded-xl border border-slate-200 bg-white p-2.5 shadow-sm sm:p-3">
      <CalendarDateTimePicker
        date={date}
        onDateChange={onDateChange}
        startHour={startHour}
        endHour={endHour}
        onTimeRangeChange={onTimeRangeChange}
      />
    </div>
  );

  const timeRangePanel = (
    <div className="space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Visible time range</p>
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-600">From</span>
          <select
            value={startHour}
            onChange={(e) => onTimeRangeChange(Number(e.target.value), endHour)}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
          >
            {Array.from({ length: 23 }, (_, h) => h).map((h) => (
              <option key={h} value={h} disabled={h >= endHour}>
                {String(h).padStart(2, '0')}:00
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-600">Until</span>
          <select
            value={endHour}
            onChange={(e) => onTimeRangeChange(startHour, Number(e.target.value))}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
          >
            {Array.from({ length: 24 }, (_, i) => i + 1).map((h) => (
              <option key={h} value={h} disabled={h <= startHour}>
                {String(h).padStart(2, '0')}:00
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );

  return (
    <OperationsWorkspaceToolbar
      title="Calendar"
      summary={toolbarSummary}
      summaryContent={summaryContent}
      date={date}
      dateLabel={periodLabel}
      onDateChange={onDateChange}
      onPreviousDate={() => onNavigateDay(-1)}
      onNextDate={() => onNavigateDay(1)}
      liveState="live"
      onRefresh={onRefresh}
      onNewBooking={onNewBooking}
      onWalkIn={onWalkIn}
      datePickerPanel={datePickerPanel}
      timelinePanel={timeRangePanel}
      timelineLabel={`${String(startHour).padStart(2, '0')}:00-${String(endHour).padStart(2, '0')}:00`}
      controlsPanel={controlsPanel}
      controlsLabel={controlsLabel}
      compact
      pinnedRow={viewModeSwitcher}
    />
  );
}
