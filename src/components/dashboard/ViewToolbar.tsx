'use client';

import { SummaryBar } from '@/components/dashboard/SummaryBar';
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
  /** Page title shown top-left (e.g. "Table grid", "Live floor"). */
  title: string;
  /** Extra controls in the top action row after Today (e.g. Print, Export). */
  secondaryActions?: React.ReactNode;
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
  title,
  secondaryActions,
  children,
}: ViewToolbarProps) {
  const todayIso = formatDateInput(new Date());
  const isToday = date === todayIso;

  return (
    <div className="space-y-4">
      {/* Row 1 — matches bookings: title + primary actions */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Operations</p>
          <h1 className="truncate text-lg font-semibold text-slate-900 sm:text-xl">{title}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => onDateChange(todayIso)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 shadow-sm hover:bg-slate-50"
          >
            Today
          </button>
          {secondaryActions}
          <button
            type="button"
            onClick={onRefresh}
            className="rounded-lg border border-slate-200 bg-white p-2 text-slate-500 shadow-sm hover:bg-slate-50 hover:text-slate-700"
            aria-label="Refresh"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182" />
            </svg>
          </button>
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${
              liveState === 'live'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                : 'border-amber-200 bg-amber-50 text-amber-700'
            }`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${liveState === 'live' ? 'bg-emerald-500' : 'bg-amber-500'}`} />
            {liveState === 'live' ? 'Live' : 'Reconnecting'}
          </span>
          <button
            type="button"
            onClick={onNewBooking}
            className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-brand-700"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            New Booking
          </button>
          <button
            type="button"
            onClick={onWalkIn}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-emerald-700"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
            </svg>
            Walk-in
          </button>
        </div>
      </div>

      {/* Row 2 — date navigator (bookings-style) */}
      <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-3 shadow-sm sm:px-4">
        <button
          type="button"
          onClick={() => onDateChange(shiftDate(date, -1))}
          className="rounded-lg p-2 text-slate-400 hover:bg-slate-50 hover:text-slate-600"
          aria-label="Previous day"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
          </svg>
        </button>
        <div className="min-w-0 flex-1 px-2 text-center">
          <h2 className="truncate text-sm font-semibold text-slate-900 sm:text-base">{formatDateHeading(date)}</h2>
          {isToday && <span className="text-xs font-medium text-brand-600">Today</span>}
        </div>
        <button
          type="button"
          onClick={() => onDateChange(shiftDate(date, 1))}
          className="rounded-lg p-2 text-slate-400 hover:bg-slate-50 hover:text-slate-600"
          aria-label="Next day"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
          </svg>
        </button>
      </div>

      {/* Row 3 — stat cards (same grid language as bookings) */}
      <SummaryBar summary={summary} />

      {/* Row 4 — filters & tools */}
      {children && (
        <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm sm:flex-row sm:flex-wrap sm:items-center">
          {children}
        </div>
      )}
    </div>
  );
}
