'use client';

import { useCallback, useState } from 'react';
import type { VenueSettings, OpeningHoursSettings, OpeningHoursDaySettings } from '../types';
import { BusinessClosuresSection } from './BusinessClosuresSection';

const DAYS: { key: string; label: string }[] = [
  { key: '0', label: 'Sunday' },
  { key: '1', label: 'Monday' },
  { key: '2', label: 'Tuesday' },
  { key: '3', label: 'Wednesday' },
  { key: '4', label: 'Thursday' },
  { key: '5', label: 'Friday' },
  { key: '6', label: 'Saturday' },
];

function getDayConfig(oh: OpeningHoursSettings | null, day: string): OpeningHoursDaySettings {
  const d = oh?.[day] as { closed?: boolean; periods?: { open: string; close: string }[]; open?: string; close?: string } | undefined;
  if (!d) return { closed: true };
  if (d.periods?.length) return { periods: d.periods };
  if (d.closed === true) return { closed: true };
  if (typeof d.open === 'string' && typeof d.close === 'string') return { periods: [{ open: d.open, close: d.close }] };
  return { closed: true };
}

interface OpeningHoursSectionProps {
  venue: VenueSettings;
  onUpdate: (patch: Partial<VenueSettings>) => void;
  isAdmin: boolean;
  bookingModel: string;
}

export function OpeningHoursSection({ venue, onUpdate, isAdmin, bookingModel }: OpeningHoursSectionProps) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [local, setLocal] = useState<OpeningHoursSettings>(() => {
    const o: OpeningHoursSettings = {};
    for (const { key } of DAYS) {
      o[key] = getDayConfig(venue.opening_hours, key);
    }
    return o;
  });

  const setDay = useCallback((day: string, config: OpeningHoursDaySettings) => {
    setLocal((prev) => ({ ...prev, [day]: config }));
  }, []);

  const save = useCallback(async () => {
    setError(null);
    setSaving(true);
    try {
      const res = await fetch('/api/venue/opening-hours', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(local),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? 'Failed to save');
      }
      const { opening_hours } = await res.json();
      onUpdate({ opening_hours });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }, [local, onUpdate]);

  return (
    <section className="rounded-lg border border-neutral-200 bg-white p-6 shadow-sm">
      <h2 className="mb-4 text-lg font-semibold text-neutral-900">Opening hours</h2>
      <p className="mb-4 text-sm text-neutral-600">Set your business opening hours</p>

      <div className="space-y-4">
        {DAYS.map(({ key, label }) => {
          const config = local[key] ?? { closed: true };
          const closed = 'closed' in config && config.closed;
          const periods = !closed && 'periods' in config ? config.periods : [];
          const p1 = periods[0] ?? { open: '09:00', close: '17:00' };
          const p2 = periods[1];

          return (
            <div key={key} className="rounded border border-neutral-200 p-4">
              <div className="flex flex-wrap items-center gap-4">
                <span className="font-medium text-neutral-800 w-24">{label}</span>
                {isAdmin ? (
                  <>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={!closed}
                        onChange={(e) => {
                          if (e.target.checked) setDay(key, { periods: [{ open: '09:00', close: '17:00' }] });
                          else setDay(key, { closed: true });
                        }}
                        className="rounded"
                      />
                      <span className="text-sm">Open</span>
                    </label>
                    {!closed && (
                      <>
                        <div className="flex items-center gap-2">
                          <input
                            type="time"
                            value={p1.open}
                            onChange={(e) => setDay(key, { periods: [{ ...p1, open: e.target.value }, p2].filter(Boolean) as { open: string; close: string }[] })}
                            className="rounded border border-neutral-300 px-2 py-1 text-sm"
                          />
                          <span className="text-neutral-500">–</span>
                          <input
                            type="time"
                            value={p1.close}
                            onChange={(e) => setDay(key, { periods: [{ ...p1, close: e.target.value }, p2].filter(Boolean) as { open: string; close: string }[] })}
                            className="rounded border border-neutral-300 px-2 py-1 text-sm"
                          />
                        </div>
                        {!p2 ? (
                          <button
                            type="button"
                            onClick={() => setDay(key, { periods: [p1, { open: '17:00', close: '22:00' }] })}
                            className="text-sm text-blue-600 hover:underline"
                          >
                            + Add second period
                          </button>
                        ) : (
                          <>
                            <div className="flex items-center gap-2">
                              <input
                                type="time"
                                value={p2.open}
                                onChange={(e) => setDay(key, { periods: [p1, { ...p2, open: e.target.value }] })}
                                className="rounded border border-neutral-300 px-2 py-1 text-sm"
                              />
                              <span className="text-neutral-500">–</span>
                              <input
                                type="time"
                                value={p2.close}
                                onChange={(e) => setDay(key, { periods: [p1, { ...p2, close: e.target.value }] })}
                                className="rounded border border-neutral-300 px-2 py-1 text-sm"
                              />
                            </div>
                            <button
                              type="button"
                              onClick={() => setDay(key, { periods: [p1] })}
                              className="text-sm text-red-600 hover:underline"
                            >
                              Remove second
                            </button>
                          </>
                        )}
                      </>
                    )}
                  </>
                ) : (
                  <span className="text-sm text-neutral-600">
                    {closed ? 'Closed' : `${p1.open}–${p1.close}${p2 ? `, ${p2.open}–${p2.close}` : ''}`}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      {isAdmin && (
        <button type="button" onClick={save} disabled={saving} className="mt-4 rounded bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50">
          {saving ? 'Saving…' : 'Save opening hours'}
        </button>
      )}

      <BusinessClosuresSection bookingModel={bookingModel} venue={venue} isAdmin={isAdmin} onUpdate={onUpdate} />
    </section>
  );
}
