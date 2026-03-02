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
    <div className="mt-6 space-y-4">
      <p className="text-sm text-neutral-600">{dateStr}</p>
      <div className="grid gap-2">
        {slots.length === 0 ? (
          <p className="text-sm text-neutral-500">No availability on this date.</p>
        ) : (
          slots.map((slot) => (
            <button
              key={slot.key}
              type="button"
              onClick={() => onSelect(slot)}
              className="flex w-full items-center justify-between rounded border border-neutral-300 bg-white px-4 py-3 text-left hover:bg-neutral-50"
            >
              <span className="font-medium">{slot.label}</span>
              <span className="text-sm text-neutral-500">{slot.available_covers} covers left</span>
            </button>
          ))
        )}
      </div>
      <button type="button" onClick={onBack} className="mt-4 text-sm text-neutral-600 underline">
        ← Change date
      </button>
    </div>
  );
}
