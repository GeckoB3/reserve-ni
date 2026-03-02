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

export function DateStep({ minParty, maxParty, partySize, onPartySizeChange, onDateSelect }: DateStepProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const dates = useMemo(() => getNextDays(28), []);

  return (
    <div className="mt-6 space-y-6">
      <div>
        <label className="block text-sm font-medium text-neutral-700 mb-2">Party size</label>
        <select
          value={partySize}
          onChange={(e) => onPartySizeChange(Number(e.target.value))}
          className="w-full rounded border border-neutral-300 px-3 py-2"
        >
          {Array.from({ length: maxParty - minParty + 1 }, (_, i) => minParty + i).map((n) => (
            <option key={n} value={n}>{n} {n === 1 ? 'guest' : 'guests'}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-neutral-700 mb-2">Select date</label>
        <div className="grid grid-cols-4 gap-2">
          {dates.map((dateStr) => {
            const d = new Date(dateStr + 'T12:00:00');
            const dayName = DAY_NAMES[d.getDay()];
            const dayNum = d.getDate();
            const isSelected = selected === dateStr;
            return (
              <button
                key={dateStr}
                type="button"
                onClick={() => {
                  setSelected(dateStr);
                  onDateSelect(dateStr);
                }}
                className={`rounded border px-3 py-3 text-center text-sm ${isSelected ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-300 bg-white hover:bg-neutral-50'}`}
              >
                <span className="block font-medium">{dayNum}</span>
                <span className="block text-xs opacity-80">{dayName}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
