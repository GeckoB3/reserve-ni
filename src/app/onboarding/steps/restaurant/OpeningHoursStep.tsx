'use client';

import { useState } from 'react';
import type { OpeningHoursSettings } from '@/app/dashboard/settings/types';
import { OpeningHoursControl, defaultOpeningHoursSettings } from '@/components/scheduling/OpeningHoursControl';

interface Props {
  onDone: () => Promise<void>;
}

export function OpeningHoursStep({ onDone }: Props) {
  const [hours, setHours] = useState<OpeningHoursSettings>(() => {
    const defaults = defaultOpeningHoursSettings();
    // Restaurant-friendly defaults: Mon–Sat noon–23:00, Sun closed
    return {
      '0': { closed: true },
      '1': { periods: [{ open: '12:00', close: '23:00' }] },
      '2': { periods: [{ open: '12:00', close: '23:00' }] },
      '3': { periods: [{ open: '12:00', close: '23:00' }] },
      '4': { periods: [{ open: '12:00', close: '23:00' }] },
      '5': { periods: [{ open: '12:00', close: '23:00' }] },
      '6': { periods: [{ open: '12:00', close: '23:00' }] },
      ...defaults,
    };
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/venue/opening-hours', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(hours),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(j.error ?? 'Failed to save opening hours');
      }
      await onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save. Please try again.');
      setSaving(false);
    }
  }

  return (
    <div>
      <h2 className="mb-1 text-lg font-bold text-slate-900">Opening hours</h2>
      <p className="mb-4 text-sm text-slate-500">
        Set the hours your restaurant is open for bookings. You can update these any time from{' '}
        <span className="font-medium text-slate-700">Settings → Business Hours</span>.
      </p>
      <div className="mb-6 rounded-xl border border-slate-200 bg-slate-50/80 p-4 text-sm text-slate-600">
        These are the outer limits for online reservations. Your dining services (set in the next step) further
        define when specific sittings are available within these hours.
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      <OpeningHoursControl value={hours} onChange={setHours} disabled={saving} />

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
