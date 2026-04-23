'use client';

import type { ReactNode } from 'react';
import { SummaryStrip } from '@/components/ui/dashboard/SummaryStrip';
import { Pill } from '@/components/ui/dashboard/Pill';
import { ToolbarRow } from '@/components/ui/dashboard/ToolbarRow';
import type { NextBookingsSlotSummary } from '@/lib/table-management/next-bookings-slot';

export type { NextBookingsSlotSummary };

function formatDateInput(d: Date): string {
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function shiftDate(isoDate: string, deltaDays: number): string {
  const base = new Date(`${isoDate}T00:00:00`);
  base.setDate(base.getDate() + deltaDays);
  return formatDateInput(base);
}

/** Long heading like the bookings dashboard day navigator. */
function formatDateHeading(isoDate: string): string {
  const d = new Date(`${isoDate}T12:00:00`);
  return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

export interface ViewToolbarSummary {
  total_covers_booked: number;
  total_covers_capacity: number;
  tables_in_use: number;
  tables_total: number;
  unassigned_count: number;
  combos_in_use?: number;
  /** When set, the first stat uses this value (covers on tables at “now” / timeline). */
  covers_in_use_now?: number;
  /** Next booking arrival time(s) after the reference time; `null` = none upcoming. */
  next_bookings_slot?: NextBookingsSlotSummary | null;
}

interface ViewToolbarProps {
  summary: ViewToolbarSummary;
  date: string;
  onDateChange: (date: string) => void;
  liveState: 'live' | 'reconnecting';
  onRefresh: () => void;
  onNewBooking: () => void;
  onWalkIn: () => void;
  /** Page title shown top-left (e.g. "Table grid", "Live floor"). Omit when a parent `PageHeader` owns the title. */
  title?: string;
  /** Extra controls in the top action row after Today (e.g. Print, Export). */
  secondaryActions?: React.ReactNode;
  /**
   * When set, replaces the simple prev/next day bar with this content (e.g. `CalendarDateTimePicker`
   * from dashboard/bookings). When omitted, the default day navigator is shown.
   */
  datePicker?: ReactNode;
  /** Extra controls rendered in a filters/tools card below stats (zoom, filters, search). */
  children?: React.ReactNode;
}

export function ViewToolbar({
  summary,
  date,
  onDateChange,
  liveState,
  onRefresh,
  onNewBooking,
  onWalkIn,
  title = '',
  secondaryActions,
  datePicker,
  children,
}: ViewToolbarProps) {
  const todayIso = formatDateInput(new Date());
  const isToday = date === todayIso;

  const actions = (
    <>
      <button
        type="button"
        onClick={() => onDateChange(todayIso)}
        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 sm:text-sm"
      >
        Today
      </button>
      {secondaryActions}
      <button
        type="button"
        onClick={onRefresh}
        className="rounded-xl border border-slate-200 bg-white p-2 text-slate-500 shadow-sm hover:bg-slate-50 hover:text-slate-800"
        aria-label="Refresh"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182"
          />
        </svg>
      </button>
      <Pill variant={liveState === 'live' ? 'success' : 'warning'} dot>
        {liveState === 'live' ? 'Live' : 'Reconnecting'}
      </Pill>
      <button
        type="button"
        onClick={onNewBooking}
        className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 sm:px-4 sm:py-2.5"
        aria-label="New Booking"
      >
        <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
        <span className="hidden sm:inline">New Booking</span>
      </button>
      <button
        type="button"
        onClick={onWalkIn}
        className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 sm:px-4 sm:py-2.5"
        aria-label="Walk-in"
      >
        <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z"
          />
        </svg>
        <span className="hidden sm:inline">Walk-in</span>
      </button>
    </>
  );

  const dateRow =
    datePicker ??
    (
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => onDateChange(shiftDate(date, -1))}
          className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          aria-label="Previous day"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
          </svg>
        </button>
        <div className="min-w-0 flex-1 px-2 text-center">
          <h2 className="truncate text-sm font-bold text-slate-900 sm:text-base">{formatDateHeading(date)}</h2>
          {isToday ? (
            <span className="text-[10px] font-semibold uppercase tracking-wider text-brand-600">Today</span>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => onDateChange(shiftDate(date, 1))}
          className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          aria-label="Next day"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
          </svg>
        </button>
      </div>
    );

  return (
    <ToolbarRow
      eyebrow="Operations"
      title={title}
      actions={actions}
      dateRow={dateRow}
      statsRow={<SummaryStrip summary={summary} />}
      toolsRow={children}
    />
  );
}
