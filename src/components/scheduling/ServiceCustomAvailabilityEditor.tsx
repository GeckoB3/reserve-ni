'use client';

import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ServiceCustomRule, ServiceCustomScheduleV2, TimeRange, WorkingHours } from '@/types/booking-models';
import { WorkingHoursControl } from '@/components/scheduling/WorkingHoursControl';
import {
  ServiceAvailabilityMonthGrid,
  isoDateRangeToSet,
  type DayVisualState,
  ymdFromParts,
} from '@/components/scheduling/ServiceAvailabilityMonthGrid';
import { DAY_ORDER, formatServiceCustomScheduleSummary, newRuleId } from '@/lib/service-custom-availability';

const DAY_KEYS = ['1', '2', '3', '4', '5', '6', '0'] as const;

type ScheduleTabId = 'weekly' | 'specific_dates' | 'date_range_pattern';

function TimeWindowsEditor({
  ranges,
  onChange,
  disabled,
  label = 'Time windows',
}: {
  ranges: TimeRange[];
  onChange: (next: TimeRange[]) => void;
  disabled?: boolean;
  label?: string;
}) {
  function updateRange(i: number, field: 'start' | 'end', v: string) {
    const next = [...ranges];
    next[i] = { ...next[i]!, [field]: v };
    onChange(next);
  }
  function addRange() {
    onChange([...ranges, { start: '09:00', end: '17:00' }]);
  }
  function removeRange(i: number) {
    const next = ranges.filter((_, j) => j !== i);
    onChange(next.length > 0 ? next : [{ start: '09:00', end: '17:00' }]);
  }
  return (
    <div className="rounded-xl border border-slate-200/90 bg-white/90 p-3 shadow-sm">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <div className="space-y-2">
        {ranges.map((r, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2">
            <input
              type="time"
              value={r.start}
              onChange={(e) => updateRange(i, 'start', e.target.value)}
              disabled={disabled}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm font-medium text-slate-800 shadow-sm disabled:bg-slate-50"
            />
            <span className="text-xs font-medium text-slate-400">to</span>
            <input
              type="time"
              value={r.end}
              onChange={(e) => updateRange(i, 'end', e.target.value)}
              disabled={disabled}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm font-medium text-slate-800 shadow-sm disabled:bg-slate-50"
            />
            {ranges.length > 1 && !disabled && (
              <button type="button" onClick={() => removeRange(i)} className="text-xs font-medium text-red-600 hover:underline">
                Remove
              </button>
            )}
          </div>
        ))}
        {!disabled && (
          <button
            type="button"
            onClick={addRange}
            className="text-xs font-semibold text-brand-600 hover:text-brand-700"
          >
            + Add time window
          </button>
        )}
      </div>
    </div>
  );
}

function todayIsoDate(): string {
  const d = new Date();
  return ymdFromParts(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

function updateRuleAt(rules: ServiceCustomRule[], index: number, rule: ServiceCustomRule): ServiceCustomRule[] {
  const next = [...rules];
  next[index] = rule;
  return next;
}

function removeRuleAt(rules: ServiceCustomRule[], index: number): ServiceCustomRule[] {
  return rules.filter((_, i) => i !== index);
}

function useMonthState(initialYear: number, initialMonth: number) {
  const [year, setYear] = useState(initialYear);
  const [month, setMonth] = useState(initialMonth);
  function prevMonth() {
    if (month <= 1) {
      setMonth(12);
      setYear((y) => y - 1);
    } else setMonth((m) => m - 1);
  }
  function nextMonth() {
    if (month >= 12) {
      setMonth(1);
      setYear((y) => y + 1);
    } else setMonth((m) => m + 1);
  }
  return {
    year,
    month,
    prevMonth,
    nextMonth,
    setYearMonth: (y: number, m: number) => {
      setYear(y);
      setMonth(m);
    },
  };
}

function WeeklyDayRibbon({
  value,
  onChange,
  disabled,
}: {
  value: WorkingHours;
  onChange: (next: WorkingHours) => void;
  disabled?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-gradient-to-r from-slate-50/80 to-white p-3 shadow-sm">
      <p className="mb-2 text-center text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        Weekdays on / off
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        {DAY_KEYS.map((dayKey, i) => {
          const label = ['M', 'T', 'W', 'T', 'F', 'S', 'S'][i];
          const on = Boolean(value[dayKey]?.length);
          return (
            <button
              key={dayKey}
              type="button"
              disabled={disabled}
              onClick={() => {
                const copy = { ...value };
                if (copy[dayKey]?.length) delete copy[dayKey];
                else copy[dayKey] = [{ start: '09:00', end: '17:00' }];
                onChange(copy);
              }}
              className={`flex h-11 w-11 items-center justify-center rounded-full text-sm font-bold transition ${
                on
                  ? 'bg-brand-600 text-white shadow-md shadow-brand-600/25 ring-2 ring-brand-400/30'
                  : 'bg-white text-slate-400 ring-1 ring-slate-200 hover:bg-slate-50 hover:text-slate-600'
              } disabled:opacity-45`}
              aria-pressed={on}
              title={DAY_ORDER[i]?.label}
            >
              {label}
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-center text-[10px] text-slate-500">
        New days default to 09:00–17:00; split or change times below
      </p>
    </div>
  );
}

function ruleIndicesByKind(rules: ServiceCustomRule[], kind: ScheduleTabId): number[] {
  return rules.map((r, i) => (r.kind === kind ? i : -1)).filter((i) => i >= 0);
}

function initialTab(rules: ServiceCustomRule[]): ScheduleTabId {
  if (rules.some((r) => r.kind === 'weekly')) return 'weekly';
  if (rules.some((r) => r.kind === 'specific_dates')) return 'specific_dates';
  if (rules.some((r) => r.kind === 'date_range_pattern')) return 'date_range_pattern';
  return 'weekly';
}

export function ServiceCustomAvailabilityEditor({
  value,
  onChange,
  disabled = false,
}: {
  value: ServiceCustomScheduleV2;
  onChange: (next: ServiceCustomScheduleV2) => void;
  disabled?: boolean;
}) {
  const rules = value.rules;
  const todayYmd = todayIsoDate();
  const [activeTab, setActiveTab] = useState<ScheduleTabId>(() => initialTab(value.rules));
  const tabPanelMeasureRef = useRef<HTMLDivElement>(null);
  const [tabPanelMinHeightPx, setTabPanelMinHeightPx] = useState<number | null>(null);

  useLayoutEffect(() => {
    const el = tabPanelMeasureRef.current;
    if (!el) return;
    const h = Math.ceil(el.getBoundingClientRect().height);
    setTabPanelMinHeightPx((prev) => (prev == null ? h : Math.max(prev, h)));
  }, [activeTab, rules]);

  function setRules(nextRules: ServiceCustomRule[]) {
    onChange({ version: 2, rules: nextRules });
  }

  function addWeeklyRule() {
    setRules([
      ...rules,
      {
        id: newRuleId(),
        kind: 'weekly',
        windows: { '1': [{ start: '09:00', end: '17:00' }] },
      },
    ]);
    setActiveTab('weekly');
  }

  function addSpecificDatesRule() {
    setRules([
      ...rules,
      {
        id: newRuleId(),
        kind: 'specific_dates',
        entries: [],
      },
    ]);
    setActiveTab('specific_dates');
  }

  function addDateRangePatternRule() {
    const start = todayYmd;
    setRules([
      ...rules,
      {
        id: newRuleId(),
        kind: 'date_range_pattern',
        start_date: start,
        end_date: start,
        days_of_week: [1],
        ranges: [{ start: '09:00', end: '17:00' }],
      },
    ]);
    setActiveTab('date_range_pattern');
  }

  const weeklyIdx = useMemo(() => ruleIndicesByKind(rules, 'weekly'), [rules]);
  const specificIdx = useMemo(() => ruleIndicesByKind(rules, 'specific_dates'), [rules]);
  const rangeIdx = useMemo(() => ruleIndicesByKind(rules, 'date_range_pattern'), [rules]);

  const tabDefs: Array<{
    id: ScheduleTabId;
    label: string;
    count: number;
    hint: string;
  }> = [
    { id: 'weekly', label: 'Every week', count: weeklyIdx.length, hint: 'Same weekdays year-round' },
    { id: 'specific_dates', label: 'Chosen dates', count: specificIdx.length, hint: 'One-off days on the calendar' },
    { id: 'date_range_pattern', label: 'Date range', count: rangeIdx.length, hint: 'Season or block + weekdays' },
  ];

  return (
    <div className="space-y-5">
      <p className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2.5 text-xs leading-relaxed text-slate-600">
        <span className="font-medium text-slate-800">Rules add together.</span> Use the tabs to work on weekly hours,
        hand-picked dates, or a date range. If any rule allows a time, online booking may show it when the venue and
        calendars are open.
      </p>

      <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm">
        <div
          role="tablist"
          aria-label="Custom schedule rule type"
          className="flex flex-wrap border-b border-slate-200 bg-slate-50/90"
        >
          {tabDefs.map(({ id, label, count, hint }) => {
            const selected = activeTab === id;
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={selected}
                aria-controls={`schedule-tab-${id}`}
                id={`schedule-tab-trigger-${id}`}
                title={hint}
                disabled={disabled}
                onClick={() => setActiveTab(id)}
                className={`min-w-0 flex-1 px-3 py-3 text-center transition sm:px-4 ${
                  selected
                    ? 'border-b-2 border-brand-600 bg-white text-sm font-semibold text-brand-900'
                    : 'border-b-2 border-transparent text-sm font-medium text-slate-600 hover:bg-slate-100/80 hover:text-slate-900'
                } disabled:opacity-50`}
              >
                <span className="block truncate">{label}</span>
                {count > 0 ? (
                  <span className={`mt-0.5 block text-[10px] font-normal ${selected ? 'text-brand-700' : 'text-slate-500'}`}>
                    {count} block{count === 1 ? '' : 's'}
                  </span>
                ) : (
                  <span className={`mt-0.5 block text-[10px] font-normal ${selected ? 'text-slate-500' : 'text-slate-400'}`}>
                    None yet
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div
          className="p-4"
          style={tabPanelMinHeightPx != null ? { minHeight: tabPanelMinHeightPx } : undefined}
        >
          <div ref={tabPanelMeasureRef}>
          {activeTab === 'weekly' && (
            <div
              role="tabpanel"
              id="schedule-tab-weekly"
              aria-labelledby="schedule-tab-trigger-weekly"
              className="space-y-4"
            >
              <p className="text-xs text-slate-500">
                Same pattern each week. You can add more than one weekly block; they combine.
              </p>
              {weeklyIdx.length === 0 ? (
                <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50/50 px-4 py-6 text-center text-sm text-slate-600">
                  No weekly hours yet.
                  {!disabled && (
                    <>
                      {' '}
                      <button
                        type="button"
                        onClick={addWeeklyRule}
                        className="font-semibold text-brand-600 hover:text-brand-700"
                      >
                        Add weekly hours
                      </button>
                    </>
                  )}
                </p>
              ) : (
                weeklyIdx.map((ri, blockNum) => (
                  <WeeklyRuleBlock
                    key={rules[ri]!.id}
                    blockLabel={weeklyIdx.length > 1 ? `Weekly block ${blockNum + 1}` : 'Weekly schedule'}
                    ruleIndex={ri}
                    rules={rules}
                    setRules={setRules}
                    disabled={disabled}
                    onRemove={() => setRules(removeRuleAt(rules, ri))}
                    showRemove={!disabled}
                  />
                ))
              )}
              {weeklyIdx.length > 0 && !disabled && (
                <button
                  type="button"
                  onClick={addWeeklyRule}
                  className="text-xs font-semibold text-brand-600 hover:text-brand-700"
                >
                  + Add another weekly block
                </button>
              )}
            </div>
          )}

          {activeTab === 'specific_dates' && (
            <div
              role="tabpanel"
              id="schedule-tab-specific_dates"
              aria-labelledby="schedule-tab-trigger-specific_dates"
              className="space-y-4"
            >
              <p className="text-xs text-slate-500">
                Pick exact dates on the calendar. Multiple blocks combine; each block is edited separately.
              </p>
              {specificIdx.length === 0 ? (
                <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50/50 px-4 py-6 text-center text-sm text-slate-600">
                  No hand-picked dates yet.
                  {!disabled && (
                    <>
                      {' '}
                      <button
                        type="button"
                        onClick={addSpecificDatesRule}
                        className="font-semibold text-brand-600 hover:text-brand-700"
                      >
                        Add chosen dates
                      </button>
                    </>
                  )}
                </p>
              ) : (
                specificIdx.map((ri, blockNum) => (
                  <SpecificDatesRuleBlock
                    key={rules[ri]!.id}
                    blockLabel={specificIdx.length > 1 ? `Date list ${blockNum + 1}` : 'Hand-picked dates'}
                    ruleIndex={ri}
                    rules={rules}
                    setRules={setRules}
                    disabled={disabled}
                    todayYmd={todayYmd}
                    onRemove={() => setRules(removeRuleAt(rules, ri))}
                    showRemove={!disabled}
                  />
                ))
              )}
              {specificIdx.length > 0 && !disabled && (
                <button
                  type="button"
                  onClick={addSpecificDatesRule}
                  className="text-xs font-semibold text-brand-600 hover:text-brand-700"
                >
                  + Add another date list
                </button>
              )}
            </div>
          )}

          {activeTab === 'date_range_pattern' && (
            <div
              role="tabpanel"
              id="schedule-tab-date_range_pattern"
              aria-labelledby="schedule-tab-trigger-date_range_pattern"
              className="space-y-4"
            >
              <p className="text-xs text-slate-500">
                Limit booking to a from–to period on selected weekdays. Add several ranges for different seasons.
              </p>
              {rangeIdx.length === 0 ? (
                <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50/50 px-4 py-6 text-center text-sm text-slate-600">
                  No date range yet.
                  {!disabled && (
                    <>
                      {' '}
                      <button
                        type="button"
                        onClick={addDateRangePatternRule}
                        className="font-semibold text-brand-600 hover:text-brand-700"
                      >
                        Add date range
                      </button>
                    </>
                  )}
                </p>
              ) : (
                rangeIdx.map((ri, blockNum) => (
                  <DateRangeRuleBlock
                    key={rules[ri]!.id}
                    blockLabel={rangeIdx.length > 1 ? `Range ${blockNum + 1}` : 'Season or block'}
                    ruleIndex={ri}
                    rules={rules}
                    setRules={setRules}
                    disabled={disabled}
                    todayYmd={todayYmd}
                    onRemove={() => setRules(removeRuleAt(rules, ri))}
                    showRemove={!disabled}
                  />
                ))
              )}
              {rangeIdx.length > 0 && !disabled && (
                <button
                  type="button"
                  onClick={addDateRangePatternRule}
                  className="text-xs font-semibold text-brand-600 hover:text-brand-700"
                >
                  + Add another date range
                </button>
              )}
            </div>
          )}
          </div>
        </div>
      </div>

      {rules.length === 0 && (
        <p className="rounded-xl border border-amber-100 bg-amber-50/50 px-4 py-3 text-sm text-amber-950">
          With custom scheduling on, add at least one block from the tabs above. An empty schedule means this service
          would not be bookable online.
        </p>
      )}

      {rules.length > 0 && (
        <div className="rounded-xl border border-slate-200/90 bg-slate-50/50 px-4 py-3">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Plain-language preview</p>
          <p className="text-xs leading-relaxed text-slate-700 whitespace-pre-line">
            {formatServiceCustomScheduleSummary(value)}
          </p>
        </div>
      )}
    </div>
  );
}

function WeeklyRuleBlock({
  blockLabel,
  ruleIndex: ri,
  rules,
  setRules,
  disabled,
  onRemove,
  showRemove,
}: {
  blockLabel: string;
  ruleIndex: number;
  rules: ServiceCustomRule[];
  setRules: (r: ServiceCustomRule[]) => void;
  disabled: boolean;
  onRemove: () => void;
  showRemove: boolean;
}) {
  const rule = rules[ri];
  if (!rule || rule.kind !== 'weekly') return null;

  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50/40 p-4 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="text-sm font-semibold text-slate-900">{blockLabel}</p>
        {showRemove && (
          <button type="button" onClick={onRemove} className="text-xs font-semibold text-red-600 hover:underline">
            Remove block
          </button>
        )}
      </div>
      <WeeklyDayRibbon
        value={rule.windows as WorkingHours}
        onChange={(windows) => setRules(updateRuleAt(rules, ri, { ...rule, windows }))}
        disabled={disabled}
      />
      <WorkingHoursControl
        value={rule.windows as WorkingHours}
        onChange={(windows) => setRules(updateRuleAt(rules, ri, { ...rule, windows }))}
        disabled={disabled}
      />
    </div>
  );
}

function SpecificDatesRuleBlock({
  blockLabel,
  ruleIndex: ri,
  rules,
  setRules,
  disabled,
  todayYmd,
  onRemove,
  showRemove,
}: {
  blockLabel: string;
  ruleIndex: number;
  rules: ServiceCustomRule[];
  setRules: (r: ServiceCustomRule[]) => void;
  disabled: boolean;
  todayYmd: string;
  onRemove: () => void;
  showRemove: boolean;
}) {
  const rule = rules[ri];
  const specificRule = rule?.kind === 'specific_dates' ? rule : null;
  const entries = specificRule?.entries ?? [];
  const now = new Date();
  const initialY = entries[0]?.date ? Number(entries[0].date.slice(0, 4)) : now.getFullYear();
  const initialM = entries[0]?.date ? Number(entries[0].date.slice(5, 7)) : now.getMonth() + 1;
  const monthNavSpecific = useMonthState(initialY, initialM);

  const [selectedEntryIdx, setSelectedEntryIdx] = useState(0);
  const specificEntryCount = entries.length;
  const selectedIdx =
    specificEntryCount === 0 ? 0 : Math.min(selectedEntryIdx, Math.max(0, specificEntryCount - 1));

  if (!specificRule) return null;

  const sr = specificRule;
  const entryDateSet = new Set(entries.map((e) => e.date));
  const sel = entries[selectedIdx];

  function addOrSelectDate(ymd: string) {
    const idx = entries.findIndex((e) => e.date === ymd);
    if (idx >= 0) {
      setSelectedEntryIdx(idx);
      return;
    }
    const nextEntries = [...entries, { date: ymd, ranges: [{ start: '09:00', end: '17:00' }] }].sort((a, b) =>
      a.date.localeCompare(b.date),
    );
    setRules(updateRuleAt(rules, ri, { ...sr, entries: nextEntries } as ServiceCustomRule));
    setSelectedEntryIdx(nextEntries.findIndex((e) => e.date === ymd));
  }

  function getDayState(ymd: string): DayVisualState {
    if (sel?.date === ymd) return 'selected-entry';
    if (entryDateSet.has(ymd)) return 'has-entry';
    if (ymd === todayYmd) return 'today';
    return 'default';
  }

  function removeEntryAt(ei: number) {
    const nextEntries = entries.filter((_, j) => j !== ei);
    if (nextEntries.length === 0) {
      onRemove();
      return;
    }
    setRules(updateRuleAt(rules, ri, { ...sr, entries: nextEntries } as ServiceCustomRule));
    setSelectedEntryIdx(Math.min(ei, nextEntries.length - 1));
  }

  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50/40 p-4 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-slate-900">{blockLabel}</p>
          <p className="mt-0.5 text-xs text-slate-500">
            Tap the calendar to add or select a date; set hours on the right.
          </p>
        </div>
        {showRemove && (
          <button type="button" onClick={onRemove} className="text-xs font-semibold text-red-600 hover:underline">
            Remove block
          </button>
        )}
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(260px,340px)] lg:items-start">
        <ServiceAvailabilityMonthGrid
          year={monthNavSpecific.year}
          month={monthNavSpecific.month}
          todayYmd={todayYmd}
          onPrevMonth={monthNavSpecific.prevMonth}
          onNextMonth={monthNavSpecific.nextMonth}
          getDayState={getDayState}
          onDayClick={disabled ? undefined : addOrSelectDate}
          disabled={disabled}
          subtitle="Calendar"
          footerHint="Bright = editing · soft = other dates in this block · ring = today"
        />
        <div className="space-y-3">
          {entries.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-200 bg-white px-3 py-6 text-center text-sm text-slate-600">
              No dates in this block yet. Tap the calendar to add one.
            </p>
          ) : sel ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2">
                <span className="text-sm font-semibold text-slate-800">
                  {new Date(sel.date + 'T12:00:00').toLocaleDateString(undefined, {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </span>
                {!disabled && entries.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeEntryAt(selectedIdx)}
                    className="text-xs font-semibold text-red-600 hover:underline"
                  >
                    Remove date
                  </button>
                )}
              </div>
              <TimeWindowsEditor
                ranges={sel.ranges}
                disabled={disabled}
                onChange={(ranges) => {
                  const nextEntries = [...entries];
                  nextEntries[selectedIdx] = { ...sel, ranges };
                  setRules(updateRuleAt(rules, ri, { ...sr, entries: nextEntries } as ServiceCustomRule));
                }}
              />
            </>
          ) : null}
          {entries.length > 1 && (
            <div className="flex flex-wrap gap-1.5">
              {entries.map((e, ei) => (
                <button
                  key={e.date}
                  type="button"
                  disabled={disabled}
                  onClick={() => setSelectedEntryIdx(ei)}
                  className={`rounded-lg px-2.5 py-1 text-xs font-medium transition ${
                    ei === selectedIdx ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  {e.date.slice(5)}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DateRangeRuleBlock({
  blockLabel,
  ruleIndex: ri,
  rules,
  setRules,
  disabled,
  todayYmd,
  onRemove,
  showRemove,
}: {
  blockLabel: string;
  ruleIndex: number;
  rules: ServiceCustomRule[];
  setRules: (r: ServiceCustomRule[]) => void;
  disabled: boolean;
  todayYmd: string;
  onRemove: () => void;
  showRemove: boolean;
}) {
  const rule = rules[ri];
  const rangeRule = rule?.kind === 'date_range_pattern' ? rule : null;
  const now = new Date();
  const rangeY = rangeRule ? Number(rangeRule.start_date.slice(0, 4)) : now.getFullYear();
  const rangeM = rangeRule ? Number(rangeRule.start_date.slice(5, 7)) : now.getMonth() + 1;
  const monthNavRange = useMonthState(
    Number.isFinite(rangeY) && rangeY > 0 ? rangeY : now.getFullYear(),
    Number.isFinite(rangeM) && rangeM >= 1 && rangeM <= 12 ? rangeM : now.getMonth() + 1,
  );

  const [rangeTapPhase, setRangeTapPhase] = useState(0);

  if (!rangeRule) return null;

  const rr = rangeRule;
  const rangeSet = isoDateRangeToSet(rr.start_date, rr.end_date);
  const lo = rr.start_date <= rr.end_date ? rr.start_date : rr.end_date;
  const hi = rr.start_date <= rr.end_date ? rr.end_date : rr.start_date;

  function getDayState(ymd: string): DayVisualState {
    if (ymd === lo || ymd === hi) return 'range-endpoint';
    if (rangeSet.has(ymd)) return 'in-range';
    if (ymd === todayYmd) return 'today';
    return 'default';
  }

  function onRangeDayClick(ymd: string) {
    if (disabled) return;
    if (rangeTapPhase % 2 === 0) {
      setRules(updateRuleAt(rules, ri, { ...rr, start_date: ymd, end_date: ymd } as ServiceCustomRule));
    } else {
      const s = rr.start_date;
      const a = ymd < s ? ymd : s;
      const b = ymd < s ? s : ymd;
      setRules(updateRuleAt(rules, ri, { ...rr, start_date: a, end_date: b } as ServiceCustomRule));
    }
    setRangeTapPhase((p) => p + 1);
  }

  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50/40 p-4 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-slate-900">{blockLabel}</p>
          <p className="mt-0.5 text-xs text-slate-500">
            Shaded days are in range; bold are start/end. Refine with the fields on the right.
          </p>
        </div>
        {showRemove && (
          <button type="button" onClick={onRemove} className="text-xs font-semibold text-red-600 hover:underline">
            Remove block
          </button>
        )}
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px] lg:items-start">
        <ServiceAvailabilityMonthGrid
          year={monthNavRange.year}
          month={monthNavRange.month}
          todayYmd={todayYmd}
          onPrevMonth={monthNavRange.prevMonth}
          onNextMonth={monthNavRange.nextMonth}
          getDayState={getDayState}
          onDayClick={onRangeDayClick}
          disabled={disabled}
          subtitle="Tap twice for start & end"
          footerHint={
            rangeTapPhase % 2 === 0
              ? 'Next tap: stretch the end (same day twice = one day only).'
              : 'Next tap: new range start.'
          }
        />
        <div className="space-y-3">
          <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
            <div>
              <span className="font-semibold text-slate-700">From</span> {lo}
            </div>
            <div>
              <span className="font-semibold text-slate-700">To</span> {hi}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">From</label>
              <input
                type="date"
                value={rr.start_date}
                disabled={disabled}
                onChange={(e) =>
                  setRules(
                    updateRuleAt(rules, ri, {
                      ...rr,
                      start_date: e.target.value,
                      end_date: e.target.value > rr.end_date ? e.target.value : rr.end_date,
                    } as ServiceCustomRule),
                  )
                }
                className="w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm shadow-sm disabled:bg-slate-50"
              />
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">To</label>
              <input
                type="date"
                value={rr.end_date}
                disabled={disabled}
                onChange={(e) =>
                  setRules(
                    updateRuleAt(rules, ri, {
                      ...rr,
                      end_date: e.target.value,
                      start_date: e.target.value < rr.start_date ? e.target.value : rr.start_date,
                    } as ServiceCustomRule),
                  )
                }
                className="w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm shadow-sm disabled:bg-slate-50"
              />
            </div>
          </div>
          <div>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Weekdays</p>
            <div className="flex flex-wrap gap-1.5">
              {DAY_ORDER.map(({ key, label }) => {
                const dow = Number(key);
                const on = rr.days_of_week.includes(dow);
                return (
                  <button
                    key={key}
                    type="button"
                    disabled={disabled}
                    onClick={() => {
                      const nextDays = on
                        ? rr.days_of_week.filter((d) => d !== dow)
                        : [...rr.days_of_week, dow].sort((a, b) => a - b);
                      if (nextDays.length === 0) return;
                      setRules(updateRuleAt(rules, ri, { ...rr, days_of_week: nextDays } as ServiceCustomRule));
                    }}
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                      on ? 'bg-brand-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {label.slice(0, 3)}
                  </button>
                );
              })}
            </div>
          </div>
          <TimeWindowsEditor
            ranges={rr.ranges}
            disabled={disabled}
            onChange={(ranges) => setRules(updateRuleAt(rules, ri, { ...rr, ranges } as ServiceCustomRule))}
          />
        </div>
      </div>
    </div>
  );
}
