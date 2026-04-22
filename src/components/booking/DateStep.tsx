'use client';

import { useMemo, useState } from 'react';

interface DateStepProps {
  minParty: number;
  maxParty: number;
  partySize: number;
  /** Inclusive window from today: day 0 = today (aligned with booking engine advance rules). */
  maxAdvanceBookingDays: number;
  onPartySizeChange: (n: number) => void;
  onDateSelect: (date: string) => void;
}

const DAY_HEADERS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function toDateStr(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

interface CalendarDay {
  dateStr: string;
  day: number;
  inMonth: boolean;
  disabled: boolean;
}

export function DateStep({
  minParty,
  maxParty,
  partySize,
  maxAdvanceBookingDays,
  onPartySizeChange,
  onDateSelect,
}: DateStepProps) {
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const todayStr = useMemo(() => toDateStr(today), [today]);

  const cappedAdvanceDays = Math.max(1, Math.min(365, Math.floor(maxAdvanceBookingDays)));

  const maxDate = useMemo(() => {
    const d = new Date(today);
    d.setDate(d.getDate() + cappedAdvanceDays);
    return d;
  }, [today, cappedAdvanceDays]);

  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [selected, setSelected] = useState<string | null>(null);

  const calendarDays = useMemo((): CalendarDay[] => {
    const days: CalendarDay[] = [];
    const firstOfMonth = new Date(viewYear, viewMonth, 1);
    // Monday-based offset (Mon=0 … Sun=6)
    const startOffset = (firstOfMonth.getDay() + 6) % 7;
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

    // Leading cells from previous month (greyed out, non-interactive)
    for (let i = startOffset - 1; i >= 0; i--) {
      const d = new Date(viewYear, viewMonth, -i);
      days.push({ dateStr: toDateStr(d), day: d.getDate(), inMonth: false, disabled: true });
    }

    // Current month
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(viewYear, viewMonth, d);
      const dateStr = toDateStr(date);
      const disabled = date < today || date > maxDate;
      days.push({ dateStr, day: d, inMonth: true, disabled });
    }

    // Trailing cells to complete last row
    const remaining = (7 - (days.length % 7)) % 7;
    for (let i = 1; i <= remaining; i++) {
      const d = new Date(viewYear, viewMonth + 1, i);
      days.push({ dateStr: toDateStr(d), day: i, inMonth: false, disabled: true });
    }

    return days;
  }, [viewYear, viewMonth, today, maxDate]);

  const canGoPrev = viewYear > today.getFullYear() || viewMonth > today.getMonth();
  const canGoNext = !(viewYear === maxDate.getFullYear() && viewMonth === maxDate.getMonth());

  function prevMonth() {
    if (!canGoPrev) return;
    if (viewMonth === 0) { setViewMonth(11); setViewYear((y) => y - 1); }
    else setViewMonth((m) => m - 1);
  }

  function nextMonth() {
    if (!canGoNext) return;
    if (viewMonth === 11) { setViewMonth(0); setViewYear((y) => y + 1); }
    else setViewMonth((m) => m + 1);
  }

  return (
    <div className="space-y-6">
      {/* Party size counter */}
      <div>
        <label className="mb-3 block text-sm font-semibold text-slate-700">Number of guests</label>
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => onPartySizeChange(Math.max(minParty, partySize - 1))}
            disabled={partySize <= minParty}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-lg font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-30"
          >
            &minus;
          </button>
          <span className="min-w-[3rem] text-center text-2xl font-bold text-slate-900">{partySize}</span>
          <button
            type="button"
            onClick={() => onPartySizeChange(Math.min(maxParty, partySize + 1))}
            disabled={partySize >= maxParty}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-lg font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-30"
          >
            +
          </button>
          <span className="text-sm text-slate-400">{partySize === 1 ? 'guest' : 'guests'}</span>
        </div>
      </div>

      {/* Calendar */}
      <div>
        <label className="mb-3 block text-sm font-semibold text-slate-700">Choose a date</label>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">

          {/* Month navigation header */}
          <div className="mb-4 flex items-center justify-between">
            <button
              type="button"
              onClick={prevMonth}
              disabled={!canGoPrev}
              aria-label="Previous month"
              className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:opacity-20 disabled:pointer-events-none"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
              </svg>
            </button>

            <span className="text-sm font-semibold text-slate-800">
              {MONTH_NAMES[viewMonth]} {viewYear}
            </span>

            <button
              type="button"
              onClick={nextMonth}
              disabled={!canGoNext}
              aria-label="Next month"
              className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:opacity-20 disabled:pointer-events-none"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
              </svg>
            </button>
          </div>

          {/* Weekday column headers */}
          <div className="mb-1 grid grid-cols-7">
            {DAY_HEADERS.map((d) => (
              <div key={d} className="py-1 text-center text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                {d}
              </div>
            ))}
          </div>

          {/* Day grid */}
          <div className="grid grid-cols-7 gap-y-0.5">
            {calendarDays.map(({ dateStr, day, inMonth, disabled }, i) => {
              const isSelected = selected === dateStr;
              const isToday = dateStr === todayStr;

              if (!inMonth) {
                return <div key={`pad-${i}`} className="h-9" />;
              }

              return (
                <button
                  key={dateStr}
                  type="button"
                  onClick={() => {
                    setSelected(dateStr);
                    onDateSelect(dateStr);
                  }}
                  disabled={disabled}
                  aria-label={dateStr}
                  aria-pressed={isSelected}
                  className={`
                    relative mx-auto flex h-9 w-9 items-center justify-center rounded-full text-sm font-medium transition-all
                    ${isSelected
                      ? 'bg-brand-600 text-white shadow-md shadow-brand-600/25'
                      : isToday
                      ? 'font-bold text-brand-700 ring-1 ring-brand-400'
                      : disabled
                      ? 'cursor-not-allowed text-slate-200'
                      : 'text-slate-700 hover:bg-brand-50 hover:text-brand-700'
                    }
                  `}
                >
                  {day}
                  {isToday && !isSelected && (
                    <span className="absolute bottom-1 left-1/2 h-0.5 w-3 -translate-x-1/2 rounded-full bg-brand-500" />
                  )}
                </button>
              );
            })}
          </div>

        </div>
      </div>
    </div>
  );
}
