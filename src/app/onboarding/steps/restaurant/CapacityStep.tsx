'use client';

import { useEffect, useState } from 'react';

interface Service {
  id: string;
  name: string;
}

interface CapacityDraft {
  service_id: string;
  max_covers_per_slot: number;
  max_bookings_per_slot: number;
  slot_interval_minutes: number;
  buffer_minutes: number;
}

const SLOT_INTERVALS = [15, 30, 60] as const;

interface Props {
  onDone: () => Promise<void>;
}

export function CapacityStep({ onDone }: Props) {
  const [services, setServices] = useState<Service[]>([]);
  const [drafts, setDrafts] = useState<CapacityDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/venue/services');
        if (res.ok) {
          const data = await res.json() as { services?: Service[] };
          const svcs = data.services ?? [];
          setServices(svcs);
          setDrafts(
            svcs.map((s) => ({
              service_id: s.id,
              max_covers_per_slot: 20,
              max_bookings_per_slot: 10,
              slot_interval_minutes: 15,
              buffer_minutes: 15,
            })),
          );
        }
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  function update(i: number, patch: Partial<CapacityDraft>) {
    setDrafts((prev) => prev.map((d, idx) => (idx === i ? { ...d, ...patch } : d)));
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      for (const d of drafts) {
        const res = await fetch('/api/venue/capacity-rules', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...d, day_of_week: null, time_range_start: null, time_range_end: null }),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({})) as { error?: string };
          throw new Error(j.error ?? 'Failed to save capacity rules');
        }
      }
      await onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save. Please try again.');
      setSaving(false);
    }
  }

  const numCls = 'w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none';

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
      </div>
    );
  }

  if (services.length === 0) {
    return (
      <div>
        <h2 className="mb-1 text-lg font-bold text-slate-900">Capacity rules</h2>
        <p className="mb-6 text-sm text-slate-500">
          Capacity rules control how many covers and bookings are accepted per time slot.
        </p>
        <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-6 text-center text-sm text-slate-600">
          <p className="font-medium text-slate-700">No services set up yet</p>
          <p className="mt-1">
            You skipped the services step. Set up your dining services first, then add capacity rules from{' '}
            <span className="font-medium">Availability → Capacity</span> in your dashboard.
          </p>
        </div>
        <div className="mt-8 flex justify-end">
          <button
            type="button"
            onClick={onDone}
            className="rounded-lg bg-brand-600 px-6 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            Continue
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h2 className="mb-1 text-lg font-bold text-slate-900">Capacity rules</h2>
      <p className="mb-4 text-sm text-slate-500">
        Set how many covers and bookings are accepted per slot for each service. You can add fine-grained overrides
        per day or time from <span className="font-medium text-slate-700">Availability → Capacity</span> later.
      </p>

      {error && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      <div className="space-y-5">
        {drafts.map((d, i) => (
          <div key={d.service_id} className="rounded-xl border border-slate-200 bg-slate-50/40 p-4">
            <p className="mb-3 text-sm font-semibold text-slate-800">{services[i]?.name ?? `Service ${i + 1}`}</p>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Max covers per slot</label>
                <input
                  type="number"
                  min={1}
                  max={500}
                  value={d.max_covers_per_slot}
                  onChange={(e) => update(i, { max_covers_per_slot: Math.max(1, parseInt(e.target.value) || 1) })}
                  className={numCls}
                  disabled={saving}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Max bookings per slot</label>
                <input
                  type="number"
                  min={1}
                  max={500}
                  value={d.max_bookings_per_slot}
                  onChange={(e) => update(i, { max_bookings_per_slot: Math.max(1, parseInt(e.target.value) || 1) })}
                  className={numCls}
                  disabled={saving}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Slot interval</label>
                <select
                  value={d.slot_interval_minutes}
                  onChange={(e) => update(i, { slot_interval_minutes: parseInt(e.target.value) as 15 | 30 | 60 })}
                  className={numCls}
                  disabled={saving}
                >
                  {SLOT_INTERVALS.map((v) => (
                    <option key={v} value={v}>{v} min</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Turn time (buffer)</label>
                <select
                  value={d.buffer_minutes}
                  onChange={(e) => update(i, { buffer_minutes: parseInt(e.target.value) })}
                  className={numCls}
                  disabled={saving}
                >
                  {[0, 10, 15, 20, 30, 45, 60].map((v) => (
                    <option key={v} value={v}>{v === 0 ? 'None' : `${v} min`}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        ))}
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
