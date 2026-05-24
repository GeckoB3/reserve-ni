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

function cloneOpeningDayConfig(config: OpeningHoursDaySettings): OpeningHoursDaySettings {
  if ('closed' in config && config.closed) return { closed: true };
  if ('periods' in config && config.periods?.length) {
    return { periods: config.periods.map((p) => ({ open: p.open, close: p.close })) };
  }
  return { closed: true };
}

function isOpeningDayOpen(oh: OpeningHoursSettings | null, dayKey: string): boolean {
  const c = oh?.[dayKey] ? getDayConfig(oh, dayKey) : getDayConfig(null, dayKey);
  return !('closed' in c && c.closed);
}

interface OpeningHoursControlProps {
  value: OpeningHoursSettings;
  onChange: (next: OpeningHoursSettings) => void;
  disabled?: boolean;
}

function TimePeriodRow({
  p1,
  p2,
  onUpdateP1,
  onUpdateP2,
  onAddSecond,
  onRemoveSecond,
  disabled,
}: {
  p1: { open: string; close: string };
  p2?: { open: string; close: string };
  onUpdateP1: (field: 'open' | 'close', value: string) => void;
  onUpdateP2: (field: 'open' | 'close', value: string) => void;
  onAddSecond: () => void;
  onRemoveSecond: () => void;
  disabled: boolean;
}) {
  const timeInputClass =
    'min-h-10 w-full min-w-0 flex-1 rounded border border-slate-300 px-2 py-2 text-sm sm:w-auto sm:min-w-[7rem] sm:flex-none sm:py-1';

  return (
    <div className="min-w-0 max-w-full space-y-3">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <input
          type="time"
          value={p1.open}
          onChange={(e) => onUpdateP1('open', e.target.value)}
          disabled={disabled}
          className={timeInputClass}
        />
        <span className="text-slate-500">–</span>
        <input
          type="time"
          value={p1.close}
          onChange={(e) => onUpdateP1('close', e.target.value)}
          disabled={disabled}
          className={timeInputClass}
        />
      </div>
      {!p2 ? (
        <button
          type="button"
          onClick={onAddSecond}
          disabled={disabled}
          className="min-h-10 text-sm text-blue-600 hover:underline disabled:opacity-50"
        >
          + Add second period
        </button>
      ) : (
        <>
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <input
              type="time"
              value={p2.open}
              onChange={(e) => onUpdateP2('open', e.target.value)}
              disabled={disabled}
              className={timeInputClass}
            />
            <span className="text-slate-500">–</span>
            <input
              type="time"
              value={p2.close}
              onChange={(e) => onUpdateP2('close', e.target.value)}
              disabled={disabled}
              className={timeInputClass}
            />
          </div>
          <button
            type="button"
            onClick={onRemoveSecond}
            disabled={disabled}
            className="min-h-10 text-sm text-red-600 hover:underline disabled:opacity-50"
          >
            Remove second period
          </button>
        </>
      )}
    </div>
  );
}

/**
 * Controlled venue opening hours (up to two periods per day). Same behaviour as Settings → Business Hours.
 */
export function OpeningHoursControl({ value, onChange, disabled = false }: OpeningHoursControlProps) {
  const setDay = (day: string, config: OpeningHoursDaySettings) => {
    onChange({ ...value, [day]: config });
  };

  function copyThisDayToOtherOpenDays(sourceKey: string) {
    const raw = value[sourceKey] ?? getDayConfig(null, sourceKey);
    if ('closed' in raw && raw.closed) return;
    const template = cloneOpeningDayConfig(raw);
    const otherOpen = DAYS.some(({ key }) => key !== sourceKey && isOpeningDayOpen(value, key));
    if (!otherOpen) return;
    const next: OpeningHoursSettings = { ...value };
    for (const { key } of DAYS) {
      if (key === sourceKey) continue;
      if (isOpeningDayOpen(value, key)) {
        next[key] = cloneOpeningDayConfig(template);
      }
    }
    onChange(next);
  }

  return (
    <div className="min-w-0 max-w-full space-y-3 sm:space-y-4">
      {DAYS.map(({ key, label }) => {
        const config = value[key] ?? getDayConfig(null, key);
        const closed = 'closed' in config && config.closed;
        const periods = !closed && 'periods' in config ? config.periods : [];
        const p1 = periods[0] ?? { open: '09:00', close: '17:00' };
        const p2 = periods[1];
        const canCopyElsewhere =
          !closed &&
          !disabled &&
          DAYS.some(({ key: k }) => k !== key && isOpeningDayOpen(value, k));

        return (
          <div key={key} className="min-w-0 max-w-full rounded-xl border border-slate-200 p-3 sm:p-4">
            <div className="flex min-w-0 flex-col gap-3">
              <div className="flex min-w-0 items-center justify-between gap-3">
                <span className="font-medium text-slate-800">{label}</span>
                {!disabled ? (
                  <label className="flex min-h-10 cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      checked={!closed}
                      onChange={(e) => {
                        if (e.target.checked) setDay(key, { periods: [{ open: '09:00', close: '17:00' }] });
                        else setDay(key, { closed: true });
                      }}
                      className="h-4 w-4 rounded"
                    />
                    <span className="text-sm">Open</span>
                  </label>
                ) : (
                  <span className="text-sm text-slate-600">
                    {closed ? 'Closed' : `${p1.open}–${p1.close}${p2 ? `, ${p2.open}–${p2.close}` : ''}`}
                  </span>
                )}
              </div>

              {!closed && !disabled && (
                <div className="space-y-3 border-t border-slate-100 pt-3">
                  {canCopyElsewhere && (
                    <button
                      type="button"
                      onClick={() => copyThisDayToOtherOpenDays(key)}
                      className="min-h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 sm:w-auto"
                      title="Apply this day’s hours to every other day that is set to Open"
                    >
                      Copy to other open days
                    </button>
                  )}
                  <TimePeriodRow
                    p1={p1}
                    p2={p2}
                    disabled={disabled}
                    onUpdateP1={(field, nextVal) =>
                      setDay(key, {
                        periods: [{ ...p1, [field]: nextVal }, p2].filter(Boolean) as { open: string; close: string }[],
                      })
                    }
                    onUpdateP2={(field, nextVal) =>
                      setDay(key, { periods: [p1, { ...p2!, [field]: nextVal }] })
                    }
                    onAddSecond={() => setDay(key, { periods: [p1, { open: '17:00', close: '22:00' }] })}
                    onRemoveSecond={() => setDay(key, { periods: [p1] })}
                  />
                </div>
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
