'use client';

import { useState } from 'react';

interface Props {
  onDone: () => Promise<void>;
  onModeSelected: (advanced: boolean) => void;
}

export function TableModeStep({ onDone, onModeSelected }: Props) {
  const [selected, setSelected] = useState<'simple' | 'advanced'>('simple');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleContinue() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/venue/tables/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table_management_enabled: selected === 'advanced' }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(j.error ?? 'Failed to save table management setting');
      }
      onModeSelected(selected === 'advanced');
      await onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save. Please try again.');
      setSaving(false);
    }
  }

  return (
    <div>
      <h2 className="mb-1 text-lg font-bold text-slate-900">Table management</h2>
      <p className="mb-6 text-sm text-slate-500">
        Choose how you want to manage seating. You can switch modes at any time from{' '}
        <span className="font-medium text-slate-700">Availability → Table</span>.
      </p>

      {error && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      <div className="space-y-4">
        <button
          type="button"
          onClick={() => setSelected('simple')}
          disabled={saving}
          className={`w-full rounded-2xl border-2 p-5 text-left transition-all ${
            selected === 'simple'
              ? 'border-brand-500 bg-brand-50'
              : 'border-slate-200 bg-white hover:border-slate-300'
          }`}
        >
          <div className="flex items-start gap-4">
            <div className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
              selected === 'simple' ? 'border-brand-500 bg-brand-500' : 'border-slate-300'
            }`}>
              {selected === 'simple' && (
                <div className="h-2 w-2 rounded-full bg-white" />
              )}
            </div>
            <div>
              <p className="font-semibold text-slate-900">Simple covers mode</p>
              <p className="mt-1 text-sm text-slate-600">
                Track bookings by total cover count. The Day Sheet gives you a chronological view of all
                reservations for the day. No need to set up individual tables — ideal if you manage seating
                manually on the day.
              </p>
              <ul className="mt-3 space-y-1 text-xs text-slate-500">
                <li>• Day Sheet: timeline of all reservations</li>
                <li>• Capacity managed by covers per slot</li>
                <li>• No floor plan required</li>
                <li>• Good starting point — you can upgrade to Advanced later</li>
              </ul>
            </div>
          </div>
        </button>

        <button
          type="button"
          onClick={() => setSelected('advanced')}
          disabled={saving}
          className={`w-full rounded-2xl border-2 p-5 text-left transition-all ${
            selected === 'advanced'
              ? 'border-brand-500 bg-brand-50'
              : 'border-slate-200 bg-white hover:border-slate-300'
          }`}
        >
          <div className="flex items-start gap-4">
            <div className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
              selected === 'advanced' ? 'border-brand-500 bg-brand-500' : 'border-slate-300'
            }`}>
              {selected === 'advanced' && (
                <div className="h-2 w-2 rounded-full bg-white" />
              )}
            </div>
            <div>
              <p className="font-semibold text-slate-900">Advanced table management</p>
              <p className="mt-1 text-sm text-slate-600">
                Assign each booking to a specific table. Use the interactive Table Grid and Floor Plan to see
                your room at a glance, manage seating assignments, and spot availability across tables in real
                time. Requires setting up your tables and floor plan.
              </p>
              <ul className="mt-3 space-y-1 text-xs text-slate-500">
                <li>• Table Grid: per-table timeline of reservations</li>
                <li>• Floor Plan: visual room layout with live status</li>
                <li>• Table combinations for large parties</li>
                <li>• Recommended for venues managing precise seating</li>
              </ul>
            </div>
          </div>
        </button>
      </div>

      <div className="mt-8 flex justify-end">
        <button
          type="button"
          onClick={handleContinue}
          disabled={saving}
          className="rounded-lg bg-brand-600 px-6 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Continue'}
        </button>
      </div>
    </div>
  );
}
