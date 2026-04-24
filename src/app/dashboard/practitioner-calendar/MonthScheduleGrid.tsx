'use client';

import { useMemo } from 'react';
import type { MonthDayScheduleCounts } from '@/lib/calendar/schedule-blocks-grouping';

const WEEK_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

interface Props {
  monthAnchor: string;
  monthCells: string[];
  monthDayScheduleCounts: Record<string, MonthDayScheduleCounts>;
  showMergedFeeds: boolean;
  onSelectDay: (isoDate: string) => void;
}

/**
 * Month overview: per-day totals with colour dots by booking type (appointments + optional C/D/E).
 */
export function MonthScheduleGrid({
  monthAnchor,
  monthCells,
  monthDayScheduleCounts,
  showMergedFeeds,
  onSelectDay,
}: Props) {
  const todayIso = new Date().toISOString().slice(0, 10);
  const maxTotalForIntensity = useMemo(() => {
    const vals = Object.values(monthDayScheduleCounts).map(
      (s) => s.appointments + s.event_ticket + s.class_session + s.resource_booking,
    );
    return Math.max(1, ...vals);
  }, [monthDayScheduleCounts]);

  return (
    <div className="w-full min-w-0 overflow-x-auto rounded-[1.75rem] border border-slate-200 bg-white p-3 shadow-sm shadow-slate-900/5 sm:p-4">
      <div className="grid min-w-[680px] grid-cols-7 gap-1 text-center text-xs font-bold uppercase tracking-wide text-slate-500">
        {WEEK_SHORT.map((d) => (
          <div key={d} className="py-2">
            {d}
          </div>
        ))}
      </div>
      <div className="grid min-w-[680px] grid-cols-7 gap-1.5">
        {monthCells.map((cell) => {
          const inMonth = cell.startsWith(monthAnchor.slice(0, 7));
          const isToday = cell === todayIso;
          const daySummary = monthDayScheduleCounts[cell] ?? {
            appointments: 0,
            event_ticket: 0,
            class_session: 0,
            resource_booking: 0,
          };
          const total =
            daySummary.appointments +
            daySummary.event_ticket +
            daySummary.class_session +
            daySummary.resource_booking;
          const intensity = total === 0 ? 0 : Math.min(1, total / maxTotalForIntensity);
          const tip = [
            daySummary.appointments > 0
              ? `${daySummary.appointments} team appointment(s) (practitioner / unified)`
              : null,
            daySummary.event_ticket > 0 ? `${daySummary.event_ticket} event(s)` : null,
            daySummary.class_session > 0 ? `${daySummary.class_session} class(es)` : null,
            daySummary.resource_booking > 0 ? `${daySummary.resource_booking} resource(s)` : null,
          ]
            .filter(Boolean)
            .join(' · ');
          return (
            <button
              key={cell}
              type="button"
              title={tip || undefined}
              onClick={() => onSelectDay(cell)}
              className={`group flex min-h-[96px] flex-col items-start justify-between gap-2 rounded-2xl border p-2.5 text-left text-sm shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
                inMonth ? 'border-slate-200 bg-white hover:bg-slate-50' : 'border-transparent bg-slate-50/50 text-slate-400'
              }`}
              style={{
                backgroundColor:
                  total > 0 ? `rgba(99, 102, 241, ${0.08 + intensity * 0.22})` : undefined,
              }}
            >
              <div className="flex w-full items-start justify-between gap-2">
                <span
                  className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-black tabular-nums ${
                    isToday ? 'bg-slate-950 text-white shadow-sm' : 'text-slate-900'
                  }`}
                >
                  {Number(cell.slice(8, 10))}
                </span>
                {total > 0 && (
                  <span className="rounded-full bg-white/80 px-2 py-1 text-[10px] font-bold text-slate-700 shadow-sm ring-1 ring-black/5">
                    {total}
                  </span>
                )}
              </div>
              {total > 0 ? (
                <div className="flex min-h-[6px] flex-wrap justify-start gap-1" aria-hidden>
                  {daySummary.appointments > 0 ? (
                    <span
                      className="h-2 w-5 rounded-full bg-brand-500 shadow-sm"
                      title="Team appointments (practitioner / unified)"
                    />
                  ) : null}
                  {showMergedFeeds && daySummary.event_ticket > 0 ? (
                    <span className="h-2 w-5 rounded-full bg-amber-500 shadow-sm" title="Events" />
                  ) : null}
                  {showMergedFeeds && daySummary.class_session > 0 ? (
                    <span className="h-2 w-5 rounded-full bg-emerald-500 shadow-sm" title="Classes" />
                  ) : null}
                  {showMergedFeeds && daySummary.resource_booking > 0 ? (
                    <span className="h-2 w-5 rounded-full bg-slate-500 shadow-sm" title="Resources" />
                  ) : null}
                </div>
              ) : (
                <span className="text-[10px] font-medium text-slate-400">Open</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
