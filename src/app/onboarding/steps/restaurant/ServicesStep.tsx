'use client';

import { useState } from 'react';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

interface ServiceDraft {
  name: string;
  days_of_week: number[];
  start_time: string;
  end_time: string;
  last_booking_time: string;
}

const DEFAULT_SERVICES: ServiceDraft[] = [
  { name: 'Lunch', days_of_week: [1, 2, 3, 4, 5, 6], start_time: '12:00', end_time: '15:00', last_booking_time: '14:00' },
  { name: 'Dinner', days_of_week: [1, 2, 3, 4, 5, 6], start_time: '17:00', end_time: '22:00', last_booking_time: '21:00' },
];

interface Props {
  onDone: () => Promise<void>;
}

export function ServicesStep({ onDone }: Props) {
  const [drafts, setDrafts] = useState<ServiceDraft[]>(DEFAULT_SERVICES);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateDraft(i: number, patch: Partial<ServiceDraft>) {
    setDrafts((prev) => prev.map((d, idx) => (idx === i ? { ...d, ...patch } : d)));
  }

  function toggleDay(i: number, day: number) {
    setDrafts((prev) =>
      prev.map((d, idx) => {
        if (idx !== i) return d;
        const days = d.days_of_week.includes(day)
          ? d.days_of_week.filter((x) => x !== day)
          : [...d.days_of_week, day].sort((a, b) => a - b);
        return { ...d, days_of_week: days };
      }),
    );
  }

  function addService() {
    if (drafts.length >= 5) return;
    setDrafts((prev) => [
      ...prev,
      { name: '', days_of_week: [1, 2, 3, 4, 5, 6], start_time: '12:00', end_time: '22:00', last_booking_time: '21:00' },
    ]);
  }

  function removeService(i: number) {
    setDrafts((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function handleSave() {
    const valid = drafts.filter((d) => d.name.trim());
    if (valid.length === 0) {
      setError('Please enter a name for at least one service, or skip this step.');
      return;
    }
    for (const d of valid) {
      if (d.days_of_week.length === 0) {
        setError(`Service "${d.name}" must have at least one day selected.`);
        return;
      }
    }
    setSaving(true);
    setError(null);
    try {
      for (let i = 0; i < valid.length; i++) {
        const res = await fetch('/api/venue/services', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...valid[i], sort_order: i, is_active: true }),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({})) as { error?: string };
          throw new Error(j.error ?? 'Failed to create service');
        }
      }
      await onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save. Please try again.');
      setSaving(false);
    }
  }

  const inputCls = 'w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none';

  return (
    <div>
      <h2 className="mb-1 text-lg font-bold text-slate-900">Dining services</h2>
      <p className="mb-4 text-sm text-slate-500">
        Services define your sittings — when guests can book, on which days, and your last booking time. You can add,
        edit, or remove services later from <span className="font-medium text-slate-700">Availability → Services</span>.
      </p>

      {error && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      <div className="space-y-4">
        {drafts.map((d, i) => (
          <div key={i} className="rounded-xl border border-slate-200 bg-slate-50/40 p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Service {i + 1}</span>
              {drafts.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeService(i)}
                  className="text-xs text-slate-400 hover:text-red-600"
                >
                  Remove
                </button>
              )}
            </div>

            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Service name *</label>
                <input
                  type="text"
                  value={d.name}
                  onChange={(e) => updateDraft(i, { name: e.target.value })}
                  placeholder="e.g. Lunch, Dinner, Sunday Brunch"
                  className={inputCls}
                  disabled={saving}
                />
              </div>

              <div>
                <label className="mb-2 block text-xs font-medium text-slate-600">Days available</label>
                <div className="flex flex-wrap gap-1.5">
                  {DAY_LABELS.map((label, day) => (
                    <button
                      key={day}
                      type="button"
                      onClick={() => toggleDay(i, day)}
                      disabled={saving}
                      className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                        d.days_of_week.includes(day)
                          ? 'bg-brand-600 text-white'
                          : 'border border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">Start time</label>
                  <input
                    type="time"
                    value={d.start_time}
                    onChange={(e) => updateDraft(i, { start_time: e.target.value })}
                    className={inputCls}
                    disabled={saving}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">End time</label>
                  <input
                    type="time"
                    value={d.end_time}
                    onChange={(e) => updateDraft(i, { end_time: e.target.value })}
                    className={inputCls}
                    disabled={saving}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">Last booking</label>
                  <input
                    type="time"
                    value={d.last_booking_time}
                    onChange={(e) => updateDraft(i, { last_booking_time: e.target.value })}
                    className={inputCls}
                    disabled={saving}
                  />
                </div>
              </div>
            </div>
          </div>
        ))}

        {drafts.length < 5 && (
          <button
            type="button"
            onClick={addService}
            disabled={saving}
            className="w-full rounded-xl border border-dashed border-slate-300 py-3 text-sm font-medium text-slate-500 hover:border-brand-400 hover:text-brand-600"
          >
            + Add another service
          </button>
        )}
      </div>

      <div className="mt-8 flex items-center justify-between">
        <button
          type="button"
          onClick={onDone}
          disabled={saving}
          className="text-sm text-slate-500 hover:text-slate-700"
        >
          Skip for now
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="rounded-lg bg-brand-600 px-6 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save & continue'}
        </button>
      </div>
    </div>
  );
}
