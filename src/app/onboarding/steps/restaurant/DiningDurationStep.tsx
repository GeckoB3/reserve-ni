'use client';

import { useEffect, useState } from 'react';

interface Service {
  id: string;
  name: string;
}

interface BandDraft {
  min_party_size: number;
  max_party_size: number;
  duration_minutes: number;
}

const DEFAULT_BANDS: BandDraft[] = [
  { min_party_size: 1, max_party_size: 2, duration_minutes: 90 },
  { min_party_size: 3, max_party_size: 4, duration_minutes: 105 },
  { min_party_size: 5, max_party_size: 20, duration_minutes: 120 },
];

interface Props {
  onDone: () => Promise<void>;
}

export function DiningDurationStep({ onDone }: Props) {
  const [services, setServices] = useState<Service[]>([]);
  const [bands, setBands] = useState<BandDraft[]>(DEFAULT_BANDS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/venue/services');
        if (res.ok) {
          const data = await res.json() as { services?: Service[] };
          setServices(data.services ?? []);
        }
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  function updateBand(i: number, patch: Partial<BandDraft>) {
    setBands((prev) => prev.map((b, idx) => (idx === i ? { ...b, ...patch } : b)));
  }

  async function handleSave() {
    if (services.length === 0) {
      await onDone();
      return;
    }
    setSaving(true);
    setError(null);
    try {
      for (const svc of services) {
        for (const band of bands) {
          const res = await fetch('/api/venue/party-size-durations', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              service_id: svc.id,
              min_party_size: band.min_party_size,
              max_party_size: band.max_party_size,
              duration_minutes: band.duration_minutes,
              day_of_week: null,
            }),
          });
          if (!res.ok) {
            const j = await res.json().catch(() => ({})) as { error?: string };
            throw new Error(j.error ?? 'Failed to save dining durations');
          }
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
        <h2 className="mb-1 text-lg font-bold text-slate-900">Dining duration</h2>
        <p className="mb-6 text-sm text-slate-500">
          Dining duration tells the system how long to hold a table based on party size.
        </p>
        <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-6 text-center text-sm text-slate-600">
          <p className="font-medium text-slate-700">No services set up yet</p>
          <p className="mt-1">
            Set up dining services first, then configure durations from{' '}
            <span className="font-medium">Availability → Dining Duration</span>.
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
      <h2 className="mb-1 text-lg font-bold text-slate-900">Dining duration</h2>
      <p className="mb-4 text-sm text-slate-500">
        How long should a table be held for each party size? These durations apply to all your services. You can add
        per-day or per-service overrides later from{' '}
        <span className="font-medium text-slate-700">Availability → Dining Duration</span>.
      </p>

      <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50/80 p-4 text-sm text-slate-600">
        Durations will be applied to: {services.map((s) => s.name).join(', ')}.
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      <div className="space-y-3">
        {bands.map((b, i) => (
          <div key={i} className="flex items-end gap-3 rounded-xl border border-slate-200 bg-slate-50/40 p-4">
            <div className="flex-1">
              <label className="mb-1 block text-xs font-medium text-slate-600">Min party size</label>
              <input
                type="number"
                min={1}
                max={99}
                value={b.min_party_size}
                onChange={(e) => updateBand(i, { min_party_size: Math.max(1, parseInt(e.target.value) || 1) })}
                className={numCls}
                disabled={saving}
              />
            </div>
            <div className="flex-1">
              <label className="mb-1 block text-xs font-medium text-slate-600">Max party size</label>
              <input
                type="number"
                min={1}
                max={999}
                value={b.max_party_size}
                onChange={(e) => updateBand(i, { max_party_size: Math.max(1, parseInt(e.target.value) || 1) })}
                className={numCls}
                disabled={saving}
              />
            </div>
            <div className="flex-1">
              <label className="mb-1 block text-xs font-medium text-slate-600">Duration (minutes)</label>
              <select
                value={b.duration_minutes}
                onChange={(e) => updateBand(i, { duration_minutes: parseInt(e.target.value) })}
                className={numCls}
                disabled={saving}
              >
                {[45, 60, 75, 90, 105, 120, 135, 150, 180, 210, 240].map((v) => (
                  <option key={v} value={v}>{v} min</option>
                ))}
              </select>
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
