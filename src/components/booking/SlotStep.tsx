'use client';

import type { AvailableSlot } from './types';

interface SlotStepProps {
  date: string;
  slots: AvailableSlot[];
  onSelect: (slot: AvailableSlot) => void;
  onBack: () => void;
}

export function SlotStep({ date, slots, onSelect, onBack }: SlotStepProps) {
  const dateStr = new Date(date + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <button type="button" onClick={onBack} className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-slate-400 hover:bg-slate-50 hover:text-slate-600">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
          </svg>
        </button>
        <p className="text-sm font-medium text-slate-600">{dateStr}</p>
      </div>

      {slots.length === 0 ? (
        <div className="flex flex-col items-center rounded-xl border border-slate-200 bg-slate-50 py-12 text-center">
          <svg className="mb-3 h-8 w-8 text-slate-300" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
          </svg>
          <p className="text-sm text-slate-500">No availability on this date</p>
          <button type="button" onClick={onBack} className="mt-3 text-sm font-medium text-teal-600 hover:text-teal-700">Choose another date</button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {slots.map((slot) => (
            <button
              key={slot.key}
              type="button"
              onClick={() => onSelect(slot)}
              className="flex flex-col items-center rounded-xl border border-slate-200 bg-white px-4 py-3.5 transition-all hover:border-teal-300 hover:bg-teal-50/50 hover:shadow-sm"
            >
              <span className="text-base font-bold text-slate-900">{slot.start_time.slice(0, 5)}</span>
              <span className="mt-0.5 text-xs text-slate-400">{slot.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
