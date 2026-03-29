'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { PractitionerLeaveType } from '@/types/booking-models';

export interface LeavePeriodRow {
  id: string;
  practitioner_id: string;
  practitioner_name: string;
  start_date: string;
  end_date: string;
  leave_type: PractitionerLeaveType;
  notes: string | null;
  created_at: string;
}

interface PractitionerOption {
  id: string;
  name: string;
}

const LEAVE_LABELS: Record<PractitionerLeaveType, string> = {
  annual: 'Annual leave',
  sick: 'Sick leave',
  other: 'Other',
};

const LEAVE_DOT: Record<PractitionerLeaveType, string> = {
  annual: 'bg-sky-500',
  sick: 'bg-rose-500',
  other: 'bg-slate-400',
};

const LEAVE_RING: Record<PractitionerLeaveType, string> = {
  annual: 'ring-sky-200',
  sick: 'ring-rose-200',
  other: 'ring-slate-200',
};

function monthGrid(year: number, monthIndex: number): (number | null)[] {
  const first = new Date(year, monthIndex, 1);
  const startPad = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < startPad; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function ymd(year: number, monthIndex: number, day: number): string {
  const m = monthIndex + 1;
  return `${year}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function parseYmd(s: string): { y: number; m: number; d: number } {
  const [y, mo, d] = s.split('-').map(Number);
  return { y: y!, m: mo! - 1, d: d! };
}

function formatRange(start: string, end: string): string {
  const a = parseYmd(start);
  const b = parseYmd(end);
  if (a.y !== b.y) {
    return `${new Date(start + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })} – ${new Date(end + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`;
  }
  if (start === end) {
    return new Date(start + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });
  }
  return `${new Date(start + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} – ${new Date(end + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`;
}

function periodCoversDate(p: LeavePeriodRow, iso: string): boolean {
  return p.start_date <= iso && p.end_date >= iso;
}

export function StaffLeaveCalendarPanel({
  practitioners,
  isAdmin,
  selfPractitionerId = null,
  onError,
}: {
  practitioners: PractitionerOption[];
  isAdmin: boolean;
  /** When set, non-admin users can manage leave only for this practitioner (their own calendar). */
  selfPractitionerId?: string | null;
  onError: (msg: string | null) => void;
}) {
  const canManageLeave = isAdmin || Boolean(selfPractitionerId);
  const now = new Date();
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth());
  const [filterId, setFilterId] = useState<string>('all');
  const [periods, setPeriods] = useState<LeavePeriodRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<LeavePeriodRow | null>(null);
  const [formStart, setFormStart] = useState('');
  const [formEnd, setFormEnd] = useState('');
  const [formType, setFormType] = useState<PractitionerLeaveType>('annual');
  const [formPractitionerId, setFormPractitionerId] = useState('');
  const [formWholeTeam, setFormWholeTeam] = useState(false);
  const [formNotes, setFormNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const monthLabel = useMemo(
    () => new Date(viewYear, viewMonth, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }),
    [viewYear, viewMonth],
  );

  const rangeFrom = ymd(viewYear, viewMonth, 1);
  const rangeTo = ymd(viewYear, viewMonth, new Date(viewYear, viewMonth + 1, 0).getDate());

  const fetchPeriods = useCallback(async () => {
    setLoading(true);
    onError(null);
    try {
      const params = new URLSearchParams({ from: rangeFrom, to: rangeTo });
      if (filterId !== 'all') params.set('practitioner_id', filterId);
      const res = await fetch(`/api/venue/practitioner-leave?${params}`);
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        onError(typeof j.error === 'string' ? j.error : 'Could not load time off');
        setPeriods([]);
        return;
      }
      const data = (await res.json()) as { periods: LeavePeriodRow[] };
      setPeriods(data.periods ?? []);
    } catch {
      onError('Could not load time off');
      setPeriods([]);
    } finally {
      setLoading(false);
    }
  }, [filterId, rangeFrom, rangeTo, onError]);

  useEffect(() => {
    void fetchPeriods();
  }, [fetchPeriods]);

  useEffect(() => {
    if (!sheetOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSheetOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sheetOpen]);

  const grid = useMemo(() => monthGrid(viewYear, viewMonth), [viewYear, viewMonth]);

  const canEditLeave = useCallback(
    (p: LeavePeriodRow) => isAdmin || Boolean(selfPractitionerId && p.practitioner_id === selfPractitionerId),
    [isAdmin, selfPractitionerId],
  );

  function openAdd(prefillDay?: number) {
    setEditing(null);
    const start =
      prefillDay != null ? ymd(viewYear, viewMonth, prefillDay) : rangeFrom;
    setFormStart(start);
    setFormEnd(start);
    setFormType('annual');
    setFormNotes('');
    setFormWholeTeam(false);
    if (selfPractitionerId) {
      setFormPractitionerId(selfPractitionerId);
    } else if (filterId === 'all') {
      setFormPractitionerId(practitioners[0]?.id ?? '');
    } else {
      setFormPractitionerId(filterId);
    }
    setSheetOpen(true);
  }

  function openEdit(p: LeavePeriodRow) {
    setEditing(p);
    setFormStart(p.start_date);
    setFormEnd(p.end_date);
    setFormType(p.leave_type);
    setFormNotes(p.notes ?? '');
    setFormPractitionerId(p.practitioner_id);
    setFormWholeTeam(false);
    setSheetOpen(true);
  }

  async function submitForm() {
    if (!canManageLeave) return;
    if (!formStart || !formEnd || formEnd < formStart) {
      onError('Choose a valid date range');
      return;
    }
    if (!editing && !formWholeTeam && !formPractitionerId && !selfPractitionerId) {
      onError('Select a team member');
      return;
    }

    setSaving(true);
    onError(null);
    try {
      if (editing) {
        if (!canEditLeave(editing)) {
          onError('You can only edit your own time off');
          setSaving(false);
          return;
        }
        const res = await fetch('/api/venue/practitioner-leave', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: editing.id,
            start_date: formStart,
            end_date: formEnd,
            leave_type: formType,
            notes: formNotes.trim() || null,
          }),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(typeof j.error === 'string' ? j.error : 'Update failed');
        }
      } else {
        const res = await fetch('/api/venue/practitioner-leave', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            apply_to_all_active: formWholeTeam,
            practitioner_id: formWholeTeam ? undefined : formPractitionerId,
            start_date: formStart,
            end_date: formEnd,
            leave_type: formType,
            notes: formNotes.trim() || null,
          }),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(typeof j.error === 'string' ? j.error : 'Could not add leave');
        }
      }
      setSheetOpen(false);
      await fetchPeriods();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function removePeriod(id: string) {
    const row = periods.find((x) => x.id === id);
    if (!row || !canEditLeave(row)) return;
    if (!confirm('Remove this time off from the calendar?')) return;
    onError(null);
    try {
      const res = await fetch('/api/venue/practitioner-leave', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(typeof j.error === 'string' ? j.error : 'Delete failed');
      }
      await fetchPeriods();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Delete failed');
    }
  }

  const sortedPeriods = useMemo(
    () => [...periods].sort((a, b) => a.start_date.localeCompare(b.start_date) || a.practitioner_name.localeCompare(b.practitioner_name)),
    [periods],
  );

  const todayIso = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-xl space-y-1">
          <p className="text-sm text-slate-600">
            Plan annual leave and sick leave in one place. Entries here block online booking for the affected team
            members for every day in the range (full day off).
          </p>
          <p className="text-xs text-slate-500">
            Tip: use <span className="font-medium text-slate-600">Whole team</span> for closures or training days.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <>
            <label className="sr-only" htmlFor="leave-filter">
              Show leave for
            </label>
            <select
              id="leave-filter"
              value={filterId}
              onChange={(e) => setFilterId(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            >
              <option value="all">Everyone</option>
              {practitioners.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </>
          {canManageLeave && (
            <button
              type="button"
              onClick={() => openAdd()}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
            >
              Add time off
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Previous month"
            className="rounded-lg p-2 text-slate-600 hover:bg-slate-100"
            onClick={() => {
              if (viewMonth === 0) {
                setViewMonth(11);
                setViewYear((y) => y - 1);
              } else setViewMonth((m) => m - 1);
            }}
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h2 className="min-w-[10rem] text-center text-lg font-semibold text-slate-900">{monthLabel}</h2>
          <button
            type="button"
            aria-label="Next month"
            className="rounded-lg p-2 text-slate-600 hover:bg-slate-100"
            onClick={() => {
              if (viewMonth === 11) {
                setViewMonth(0);
                setViewYear((y) => y + 1);
              } else setViewMonth((m) => m + 1);
            }}
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
          <button
            type="button"
            className="ml-2 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
            onClick={() => {
              const t = new Date();
              setViewYear(t.getFullYear());
              setViewMonth(t.getMonth());
            }}
          >
            Today
          </button>
        </div>
        <div className="flex flex-wrap gap-3 text-xs text-slate-600">
          {(Object.keys(LEAVE_LABELS) as PractitionerLeaveType[]).map((k) => (
            <span key={k} className="inline-flex items-center gap-1.5">
              <span className={`h-2 w-2 rounded-full ${LEAVE_DOT[k]}`} />
              {LEAVE_LABELS[k]}
            </span>
          ))}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_minmax(16rem,20rem)]">
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {loading ? (
            <div className="flex h-64 items-center justify-center text-sm text-slate-500">Loading calendar…</div>
          ) : (
            <>
              <div className="grid grid-cols-7 border-b border-slate-100 bg-slate-50/80 text-center text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
                  <div key={d} className="px-1 py-2">
                    {d}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-px bg-slate-200 p-px">
                {grid.map((day, i) => {
                  if (day == null) {
                    return <div key={`e-${i}`} className="min-h-[5.5rem] bg-slate-50/50" />;
                  }
                  const iso = ymd(viewYear, viewMonth, day);
                  const dayPeriods = periods.filter((p) => periodCoversDate(p, iso));
                  const isToday = iso === todayIso;
                    return (
                    <div
                      key={iso}
                      className={`group relative flex min-h-[5.5rem] flex-col bg-white p-1.5 transition-colors ${
                        isToday ? 'ring-1 ring-inset ring-blue-400/60' : ''
                      }`}
                    >
                      <div className="flex items-start justify-between gap-1">
                        <span
                          className={`flex h-7 w-7 items-center justify-center rounded-full text-sm font-medium ${
                            isToday ? 'bg-blue-600 text-white' : 'text-slate-700'
                          }`}
                        >
                          {day}
                        </span>
                        {canManageLeave && (
                          <button
                            type="button"
                            title="Add time off on this day"
                            className="rounded p-0.5 text-slate-400 opacity-0 transition-opacity hover:bg-slate-100 hover:text-blue-600 group-hover:opacity-100"
                            onClick={() => openAdd(day)}
                          >
                            <span className="sr-only">Add</span>
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                          </button>
                        )}
                      </div>
                      <div className="mt-1 flex flex-1 flex-col gap-0.5">
                        {dayPeriods.slice(0, 3).map((p) => {
                          const editable = canEditLeave(p);
                          const pillTitle = `${p.practitioner_name} · ${LEAVE_LABELS[p.leave_type]}`;
                          const pillClass = `truncate rounded px-1 py-0.5 text-left text-[10px] font-medium ring-1 ring-inset ${LEAVE_RING[p.leave_type]} ${
                            p.leave_type === 'annual'
                              ? 'bg-sky-50 text-sky-900'
                              : p.leave_type === 'sick'
                                ? 'bg-rose-50 text-rose-900'
                                : 'bg-slate-50 text-slate-700'
                          } ${editable ? 'cursor-pointer hover:opacity-90' : 'cursor-default'}`;
                          const pillBody =
                            filterId === 'all' ? (
                              <>
                                <span className="block truncate font-semibold">{p.practitioner_name}</span>
                                <span className="block truncate opacity-80">{LEAVE_LABELS[p.leave_type]}</span>
                              </>
                            ) : (
                              <span className="block truncate">{LEAVE_LABELS[p.leave_type]}</span>
                            );
                          return editable ? (
                            <button
                              key={p.id}
                              type="button"
                              title={pillTitle}
                              onClick={() => openEdit(p)}
                              className={pillClass}
                            >
                              {pillBody}
                            </button>
                          ) : (
                            <div key={p.id} title={pillTitle} className={pillClass}>
                              {pillBody}
                            </div>
                          );
                        })}
                        {dayPeriods.length > 3 && (
                          <span className="text-[10px] font-medium text-slate-500">+{dayPeriods.length - 3} more</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-4 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-900">This month</h3>
          <p className="mt-0.5 text-xs text-slate-500">
            {sortedPeriods.length === 0
              ? 'No entries. Add leave or sick days to block booking.'
              : `${sortedPeriods.length} entr${sortedPeriods.length === 1 ? 'y' : 'ies'}`}
          </p>
          <ul className="mt-3 max-h-[28rem] space-y-2 overflow-y-auto pr-1">
            {sortedPeriods.map((p) => (
              <li
                key={p.id}
                className="rounded-xl border border-slate-200 bg-white p-3 text-sm shadow-sm transition hover:border-slate-300"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-slate-900">{p.practitioner_name}</p>
                    <p className="text-xs text-slate-500">{formatRange(p.start_date, p.end_date)}</p>
                    <p className="mt-1 text-xs font-medium text-slate-700">{LEAVE_LABELS[p.leave_type]}</p>
                    {p.notes && <p className="mt-1 text-xs text-slate-600 line-clamp-2">{p.notes}</p>}
                  </div>
                  {canEditLeave(p) && (
                    <div className="flex shrink-0 flex-col gap-1">
                      <button
                        type="button"
                        className="rounded-lg px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50"
                        onClick={() => openEdit(p)}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="rounded-lg px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                        onClick={() => void removePeriod(p.id)}
                      >
                        Remove
                      </button>
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {sheetOpen && (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-black/40 p-0 sm:p-4"
          role="presentation"
          onClick={() => setSheetOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="leave-sheet-title"
            className="flex h-full w-full max-w-md flex-col bg-white shadow-2xl sm:h-auto sm:max-h-[90vh] sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <h2 id="leave-sheet-title" className="text-lg font-semibold text-slate-900">
                {editing ? 'Edit time off' : 'Add time off'}
              </h2>
              <button
                type="button"
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
                onClick={() => setSheetOpen(false)}
                aria-label="Close"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
              {!editing && (
                <>
                  {!selfPractitionerId && (
                    <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-slate-50/80 p-3">
                      <input
                        type="checkbox"
                        checked={formWholeTeam}
                        onChange={(e) => setFormWholeTeam(e.target.checked)}
                        className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-600"
                      />
                      <span>
                        <span className="font-medium text-slate-900">Whole team (all active)</span>
                        <span className="mt-0.5 block text-xs text-slate-500">
                          Creates the same leave for every active team member — ideal for bank holidays or training.
                        </span>
                      </span>
                    </label>
                  )}
                  {!selfPractitionerId && !formWholeTeam && (
                    <div>
                      <label className="mb-1 block text-sm font-medium text-slate-700">Team member</label>
                      <select
                        value={formPractitionerId}
                        onChange={(e) => setFormPractitionerId(e.target.value)}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      >
                        <option value="">Select…</option>
                        {practitioners.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </>
              )}
              {editing && (
                <p className="text-sm text-slate-600">
                  <span className="font-medium text-slate-800">{editing.practitioner_name}</span>
                </p>
              )}
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Type</label>
                <div className="flex flex-wrap gap-2">
                  {(Object.keys(LEAVE_LABELS) as PractitionerLeaveType[]).map((k) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setFormType(k)}
                      className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                        formType === k
                          ? k === 'annual'
                            ? 'bg-sky-600 text-white'
                            : k === 'sick'
                              ? 'bg-rose-600 text-white'
                              : 'bg-slate-700 text-white'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {LEAVE_LABELS[k]}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Start</label>
                  <input
                    type="date"
                    value={formStart}
                    onChange={(e) => setFormStart(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">End</label>
                  <input
                    type="date"
                    value={formEnd}
                    onChange={(e) => setFormEnd(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
              </div>
              <p className="text-xs text-slate-500">Single day: set start and end to the same date.</p>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Notes (optional)</label>
                <textarea
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  rows={3}
                  placeholder="e.g. Half-day not needed — full day blocked for simplicity"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
            </div>
            <div className="flex gap-3 border-t border-slate-100 px-5 py-4">
              <button
                type="button"
                className="flex-1 rounded-lg border border-slate-300 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                onClick={() => setSheetOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={saving}
                className="flex-1 rounded-lg bg-blue-600 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                onClick={() => void submitForm()}
              >
                {saving ? 'Saving…' : editing ? 'Save changes' : 'Add to calendar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {!canManageLeave && (
        <p className="text-sm text-slate-500">
          You cannot manage time off until your account is linked to a calendar. Ask an admin to link your staff profile
          to your practitioner row.
        </p>
      )}
    </div>
  );
}
