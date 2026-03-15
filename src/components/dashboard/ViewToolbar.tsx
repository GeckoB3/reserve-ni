'use client';

import { SummaryBar } from '@/app/dashboard/table-grid/SummaryBar';

function formatDateLabel(isoDate: string): string {
  const d = new Date(isoDate + 'T12:00:00');
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === tomorrow.toDateString()) return 'Tomorrow';
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

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

export interface ViewToolbarSummary {
  total_covers_booked: number;
  total_covers_capacity: number;
  tables_in_use: number;
  tables_total: number;
  unassigned_count: number;
  combos_in_use?: number;
}

interface ViewToolbarProps {
  summary: ViewToolbarSummary;
  date: string;
  onDateChange: (date: string) => void;
  liveState: 'live' | 'reconnecting';
  onRefresh: () => void;
  onNewBooking: () => void;
  onWalkIn: () => void;
  /** Extra controls rendered after the standard buttons (e.g. filters, zoom, export) */
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
  children,
}: ViewToolbarProps) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <SummaryBar summary={summary} />
        <div className="flex flex-wrap items-center gap-2">
          {/* Date navigation */}
          <div className="flex items-center rounded-lg border border-slate-200 bg-white shadow-sm">
            <button
              type="button"
              onClick={() => onDateChange(shiftDate(date, -1))}
              className="px-2.5 py-1.5 text-slate-500 hover:text-slate-700"
              aria-label="Previous day"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => onDateChange(formatDateInput(new Date()))}
              className="border-x border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              {formatDateLabel(date)}
            </button>
            <button
              type="button"
              onClick={() => onDateChange(shiftDate(date, 1))}
              className="px-2.5 py-1.5 text-slate-500 hover:text-slate-700"
              aria-label="Next day"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
              </svg>
            </button>
          </div>

          {/* New Booking */}
          <button
            type="button"
            onClick={onNewBooking}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-brand-700"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            New Booking
          </button>

          {/* Walk-in */}
          <button
            type="button"
            onClick={onWalkIn}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
            </svg>
            Walk-in
          </button>

          {/* Refresh */}
          <button
            type="button"
            onClick={onRefresh}
            className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-500 shadow-sm hover:bg-slate-50 hover:text-slate-700"
            aria-label="Refresh"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182" />
            </svg>
          </button>

          {/* Live state */}
          <span
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-medium ${
              liveState === 'live'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                : 'border-amber-200 bg-amber-50 text-amber-700'
            }`}
          >
            <span className={`inline-block h-1.5 w-1.5 rounded-full ${liveState === 'live' ? 'bg-emerald-500' : 'bg-amber-500'}`} />
            {liveState === 'live' ? 'Live' : 'Reconnecting'}
          </span>
        </div>
      </div>

      {/* Extra view-specific controls row */}
      {children && (
        <div className="flex flex-wrap items-center gap-2">
          {children}
        </div>
      )}
    </div>
  );
}
