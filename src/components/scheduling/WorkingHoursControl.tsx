'use client';

import type { WorkingHours } from '@/types/booking-models';

const DAY_LABELS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const DAY_KEYS = ['1', '2', '3', '4', '5', '6', '0'] as const;

/**
 * Controlled working-hours editor (Mon–Sun, keys "1".."6","0"). Matches dashboard Availability behaviour.
 */
export function WorkingHoursControl({
  value,
  onChange,
  disabled = false,
}: {
  value: WorkingHours;
  onChange: (next: WorkingHours) => void;
  disabled?: boolean;
}) {
  function toggleDay(dayKey: string) {
    const copy = { ...value };
    if (copy[dayKey] && copy[dayKey]!.length > 0) {
      delete copy[dayKey];
    } else {
      copy[dayKey] = [{ start: '09:00', end: '17:00' }];
    }
    onChange(copy);
  }

  function updateRange(dayKey: string, index: number, field: 'start' | 'end', nextVal: string) {
    const ranges = [...(value[dayKey] ?? [])];
    ranges[index] = { ...ranges[index]!, [field]: nextVal };
    onChange({ ...value, [dayKey]: ranges });
  }

  function addRange(dayKey: string) {
    onChange({
      ...value,
      [dayKey]: [...(value[dayKey] ?? []), { start: '09:00', end: '17:00' }],
    });
  }

  function removeRange(dayKey: string, index: number) {
    const ranges = [...(value[dayKey] ?? [])];
    ranges.splice(index, 1);
    const copy = { ...value };
    if (ranges.length === 0) delete copy[dayKey];
    else copy[dayKey] = ranges;
    onChange(copy);
  }

  function cloneRanges(ranges: { start: string; end: string }[]) {
    return ranges.map((r) => ({ start: r.start, end: r.end }));
  }

  function copyThisDayToOtherWorkingDays(sourceKey: string) {
    const sourceRanges = value[sourceKey];
    if (!sourceRanges?.length) return;
    const template = cloneRanges(sourceRanges);
    const hasOtherWorking = DAY_KEYS.some((dk) => dk !== sourceKey && (value[dk]?.length ?? 0) > 0);
    if (!hasOtherWorking) return;
    const next: WorkingHours = { ...value };
    for (const dk of DAY_KEYS) {
      if (dk === sourceKey) continue;
      if ((value[dk]?.length ?? 0) > 0) {
        next[dk] = cloneRanges(template);
      }
    }
    onChange(next);
  }

  return (
    <div className="space-y-3">
      {DAY_KEYS.map((dayKey, i) => {
        const ranges = value[dayKey] ?? [];
        const isWorking = ranges.length > 0;
        const canCopyElsewhere =
          isWorking &&
          !disabled &&
          DAY_KEYS.some((dk) => dk !== dayKey && (value[dk]?.length ?? 0) > 0);
        return (
          <div key={dayKey} className="rounded-xl border border-slate-200 bg-white px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="flex cursor-pointer items-center gap-3">
                <input
                  type="checkbox"
                  checked={isWorking}
                  onChange={() => toggleDay(dayKey)}
                  disabled={disabled}
                  className="h-4 w-4 rounded border-slate-300 text-blue-600 disabled:opacity-50"
                />
                <span className={`text-sm font-medium ${isWorking ? 'text-slate-900' : 'text-slate-400'}`}>
                  {DAY_LABELS[i]}
                </span>
              </label>
              {isWorking && !disabled && (
                <div className="flex flex-wrap items-center gap-2">
                  {canCopyElsewhere && (
                    <button
                      type="button"
                      onClick={() => copyThisDayToOtherWorkingDays(dayKey)}
                      className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                      title="Apply this day’s hours to every other day that is ticked as working"
                    >
                      Copy to other open days
                    </button>
                  )}
                  <button type="button" onClick={() => addRange(dayKey)} className="text-xs text-blue-600 hover:underline">
                    + Add split
                  </button>
                </div>
              )}
            </div>
            {isWorking && (
              <div className="mt-2 space-y-2 pl-7">
                {ranges.map((r, ri) => (
                  <div key={ri} className="flex flex-wrap items-center gap-2">
                    <input
                      type="time"
                      value={r.start}
                      onChange={(e) => updateRange(dayKey, ri, 'start', e.target.value)}
                      disabled={disabled}
                      className="rounded-lg border border-slate-300 px-2 py-1 text-sm disabled:bg-slate-50"
                    />
                    <span className="text-sm text-slate-400">to</span>
                    <input
                      type="time"
                      value={r.end}
                      onChange={(e) => updateRange(dayKey, ri, 'end', e.target.value)}
                      disabled={disabled}
                      className="rounded-lg border border-slate-300 px-2 py-1 text-sm disabled:bg-slate-50"
                    />
                    {ranges.length > 1 && !disabled && (
                      <button
                        type="button"
                        onClick={() => removeRange(dayKey, ri)}
                        className="text-xs text-red-500 hover:underline"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
