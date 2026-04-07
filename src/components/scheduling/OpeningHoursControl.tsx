'use client';

import type { OpeningHoursDaySettings, OpeningHoursSettings } from '@/app/dashboard/settings/types';

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
  const d = oh?.[day] as
    | { closed?: boolean; periods?: { open: string; close: string }[]; open?: string; close?: string }
    | undefined;
  if (!d) return { closed: true };
  if (d.periods?.length) return { periods: d.periods };
  if (d.closed === true) return { closed: true };
  if (typeof d.open === 'string' && typeof d.close === 'string') return { periods: [{ open: d.open, close: d.close }] };
  return { closed: true };
}

interface OpeningHoursControlProps {
  value: OpeningHoursSettings;
  onChange: (next: OpeningHoursSettings) => void;
  disabled?: boolean;
}

/**
 * Controlled venue opening hours (up to two periods per day). Same behaviour as Settings → Business Hours.
 */
export function OpeningHoursControl({ value, onChange, disabled = false }: OpeningHoursControlProps) {
  const setDay = (day: string, config: OpeningHoursDaySettings) => {
    onChange({ ...value, [day]: config });
  };

  return (
    <div className="space-y-4">
      {DAYS.map(({ key, label }) => {
        const config = value[key] ?? getDayConfig(null, key);
        const closed = 'closed' in config && config.closed;
        const periods = !closed && 'periods' in config ? config.periods : [];
        const p1 = periods[0] ?? { open: '09:00', close: '17:00' };
        const p2 = periods[1];

        return (
          <div key={key} className="rounded border border-slate-200 p-4">
            <div className="flex flex-wrap items-center gap-4">
              <span className="w-24 font-medium text-slate-800">{label}</span>
              {!disabled ? (
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
                          onChange={(e) =>
                            setDay(key, { periods: [{ ...p1, open: e.target.value }, p2].filter(Boolean) as { open: string; close: string }[] })
                          }
                          className="rounded border border-slate-300 px-2 py-1 text-sm"
                        />
                        <span className="text-slate-500">–</span>
                        <input
                          type="time"
                          value={p1.close}
                          onChange={(e) =>
                            setDay(key, { periods: [{ ...p1, close: e.target.value }, p2].filter(Boolean) as { open: string; close: string }[] })
                          }
                          className="rounded border border-slate-300 px-2 py-1 text-sm"
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
                              className="rounded border border-slate-300 px-2 py-1 text-sm"
                            />
                            <span className="text-slate-500">–</span>
                            <input
                              type="time"
                              value={p2.close}
                              onChange={(e) => setDay(key, { periods: [p1, { ...p2, close: e.target.value }] })}
                              className="rounded border border-slate-300 px-2 py-1 text-sm"
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
                <span className="text-sm text-slate-600">
                  {closed ? 'Closed' : `${p1.open}–${p1.close}${p2 ? `, ${p2.open}–${p2.close}` : ''}`}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function defaultOpeningHoursSettings(): OpeningHoursSettings {
  const o: OpeningHoursSettings = {};
  for (const k of ['1', '2', '3', '4', '5', '6'] as const) {
    o[k] = { periods: [{ open: '09:00', close: '17:00' }] };
  }
  o['0'] = { closed: true };
  return o;
}
