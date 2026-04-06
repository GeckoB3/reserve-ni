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
  const maxTotalForIntensity = useMemo(() => {
    const vals = Object.values(monthDayScheduleCounts).map(
      (s) => s.appointments + s.event_ticket + s.class_session + s.resource_booking,
    );
    return Math.max(1, ...vals);
  }, [monthDayScheduleCounts]);

  return (
    <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-slate-200 bg-white p-4">
      <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-slate-500">
        {WEEK_SHORT.map((d) => (
          <div key={d} className="py-2">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {monthCells.map((cell) => {
          const inMonth = cell.startsWith(monthAnchor.slice(0, 7));
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
              className={`flex min-h-[52px] flex-col items-center justify-center gap-0.5 rounded-lg border text-sm transition-colors ${
                inMonth ? 'border-slate-200 bg-white hover:bg-slate-50' : 'border-transparent bg-slate-50/50 text-slate-400'
              }`}
              style={{
                backgroundColor:
                  total > 0 ? `rgba(99, 102, 241, ${0.12 + intensity * 0.45})` : undefined,
              }}
            >
              <span className="font-semibold text-slate-900">{Number(cell.slice(8, 10))}</span>
              {total > 0 && <span className="text-[10px] font-medium text-slate-700">{total}</span>}
              {total > 0 ? (
                <div className="flex min-h-[6px] flex-wrap justify-center gap-0.5" aria-hidden>
                  {daySummary.appointments > 0 ? (
                    <span
                      className="h-1.5 w-1.5 rounded-full bg-brand-500"
                      title="Team appointments (practitioner / unified)"
                    />
                  ) : null}
                  {showMergedFeeds && daySummary.event_ticket > 0 ? (
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-500" title="Events" />
                  ) : null}
                  {showMergedFeeds && daySummary.class_session > 0 ? (
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" title="Classes" />
                  ) : null}
                  {showMergedFeeds && daySummary.resource_booking > 0 ? (
                    <span className="h-1.5 w-1.5 rounded-full bg-slate-500" title="Resources" />
                  ) : null}
                </div>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
