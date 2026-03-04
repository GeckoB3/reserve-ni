'use client';

import { useMemo, useState } from 'react';

interface DateStepProps {
  minParty: number;
  maxParty: number;
  partySize: number;
  onPartySizeChange: (n: number) => void;
  onDateSelect: (date: string) => void;
}

function getNextDays(count: number): string[] {
  const out: string[] = [];
  const d = new Date();
  for (let i = 0; i < count; i++) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    out.push(`${y}-${m}-${day}`);
    d.setDate(d.getDate() + 1);
  }
  return out;
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function DateStep({ minParty, maxParty, partySize, onPartySizeChange, onDateSelect }: DateStepProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const dates = useMemo(() => getNextDays(28), []);

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
            className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-lg font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-30"
          >
            &minus;
          </button>
          <span className="min-w-[3rem] text-center text-2xl font-bold text-slate-900">{partySize}</span>
          <button
            type="button"
            onClick={() => onPartySizeChange(Math.min(maxParty, partySize + 1))}
            disabled={partySize >= maxParty}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-lg font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-30"
          >
            +
          </button>
          <span className="text-sm text-slate-400">{partySize === 1 ? 'guest' : 'guests'}</span>
        </div>
      </div>

      {/* Date grid */}
      <div>
        <label className="mb-3 block text-sm font-semibold text-slate-700">Choose a date</label>
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
          {dates.map((dateStr) => {
            const d = new Date(dateStr + 'T12:00:00');
            const dayName = DAY_NAMES[d.getDay()];
            const dayNum = d.getDate();
            const monthName = MONTH_NAMES[d.getMonth()];
            const isSelected = selected === dateStr;
            const isToday = dateStr === dates[0];
            return (
              <button
                key={dateStr}
                type="button"
                onClick={() => { setSelected(dateStr); onDateSelect(dateStr); }}
                className={`relative flex flex-col items-center rounded-xl border px-2 py-3 transition-all ${
                  isSelected
                    ? 'border-teal-600 bg-teal-600 text-white shadow-md shadow-teal-600/20'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-teal-300 hover:bg-teal-50/50'
                }`}
              >
                <span className={`text-xs font-medium ${isSelected ? 'text-teal-100' : 'text-slate-400'}`}>{dayName}</span>
                <span className="text-lg font-bold">{dayNum}</span>
                <span className={`text-xs ${isSelected ? 'text-teal-100' : 'text-slate-400'}`}>{monthName}</span>
                {isToday && (
                  <span className={`mt-0.5 h-1 w-1 rounded-full ${isSelected ? 'bg-white' : 'bg-teal-500'}`} />
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
