'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { NumericInput } from '@/components/ui/NumericInput';
import { isUnifiedSchedulingVenue } from '@/lib/booking/unified-scheduling';
import type { VenueSettings } from '../types';
import type { VenueOpeningException } from '@/types/venue-opening-exceptions';
import { parseVenueOpeningExceptions } from '@/types/venue-opening-exceptions';
import {
  ResourceExceptionsCalendar,
  type ExceptionDayValue,
} from '@/app/dashboard/resource-timeline/ResourceExceptionsCalendar';

const MAX_RANGE_DAYS = 366;

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function eachDateInRangeInclusive(start: string, end: string): string[] {
  const out: string[] = [];
  const [sy, sm, sd] = start.split('-').map(Number);
  const [ey, em, ed] = end.split('-').map(Number);
  const cur = new Date(sy!, sm! - 1, sd!);
  const last = new Date(ey!, em! - 1, ed!);
  while (cur <= last) {
    const y = cur.getFullYear();
    const m = String(cur.getMonth() + 1).padStart(2, '0');
    const d = String(cur.getDate()).padStart(2, '0');
    out.push(`${y}-${m}-${d}`);
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

function rangesOverlap(a: { date_start: string; date_end: string }, b: { date_start: string; date_end: string }): boolean {
  return a.date_start <= b.date_end && b.date_start <= a.date_end;
}

function findExceptionForDay(exceptions: VenueOpeningException[], ymd: string): VenueOpeningException | null {
  for (const ex of exceptions) {
    if (ex.date_start <= ymd && ymd <= ex.date_end) return ex;
  }
  return null;
}

function exceptionsToCalendarMap(exceptions: VenueOpeningException[], year: number, month: number): Record<string, ExceptionDayValue> {
  const lastDay = new Date(year, month, 0).getDate();
  const map: Record<string, ExceptionDayValue> = {};
  for (let d = 1; d <= lastDay; d++) {
    const ymd = `${year}-${pad2(month)}-${pad2(d)}`;
    const ex = findExceptionForDay(exceptions, ymd);
    if (!ex) continue;
    if (ex.closed) {
      map[ymd] = { closed: true };
    } else if (ex.periods?.length) {
      map[ymd] = {
        periods: ex.periods.map((p) => ({ start: p.open.slice(0, 5), end: p.close.slice(0, 5) })),
      };
    }
  }
  return map;
}

interface RestaurantBlock {
  id: string;
  venue_id: string;
  service_id: string | null;
  block_type: 'closed' | 'reduced_capacity' | 'special_event';
  date_start: string;
  date_end: string;
  time_start: string | null;
  time_end: string | null;
  override_max_covers: number | null;
  reason: string | null;
  yield_overrides?: Record<string, number> | null;
}

const BLOCK_PRIORITY: Record<RestaurantBlock['block_type'], number> = {
  closed: 3,
  reduced_capacity: 2,
  special_event: 1,
};

function blockCoversDate(b: RestaurantBlock, ymd: string): boolean {
  return b.date_start <= ymd && ymd <= b.date_end;
}

function bestBlockForDay(blocks: RestaurantBlock[], ymd: string): RestaurantBlock | null {
  let best: RestaurantBlock | null = null;
  let pr = -1;
  for (const b of blocks) {
    if (!blockCoversDate(b, ymd)) continue;
    const p = BLOCK_PRIORITY[b.block_type];
    if (p > pr) {
      pr = p;
      best = b;
    }
  }
  return best;
}

function blocksToCalendarMap(blocks: RestaurantBlock[], year: number, month: number): Record<string, ExceptionDayValue> {
  const lastDay = new Date(year, month, 0).getDate();
  const map: Record<string, ExceptionDayValue> = {};
  for (let d = 1; d <= lastDay; d++) {
    const ymd = `${year}-${pad2(month)}-${pad2(d)}`;
    const b = bestBlockForDay(blocks, ymd);
    if (!b) continue;
    if (b.block_type === 'closed') {
      map[ymd] = { closed: true };
    } else {
      map[ymd] = {
        periods: [{ start: b.time_start?.slice(0, 5) ?? '09:00', end: b.time_end?.slice(0, 5) ?? '22:00' }],
      };
    }
  }
  return map;
}

interface BusinessClosuresSectionProps {
  bookingModel: string;
  venue: VenueSettings;
  isAdmin: boolean;
  onUpdate: (patch: Partial<VenueSettings>) => void;
}

export function BusinessClosuresSection({ bookingModel, venue, isAdmin, onUpdate }: BusinessClosuresSectionProps) {
  if (!isAdmin) return null;

  if (isUnifiedSchedulingVenue(bookingModel)) {
    return <AppointmentVenueExceptionsEditor venue={venue} onUpdate={onUpdate} />;
  }

  return <RestaurantBlocksEditor />;
}

function AppointmentVenueExceptionsEditor({
  venue,
  onUpdate,
}: {
  venue: VenueSettings;
  onUpdate: (patch: Partial<VenueSettings>) => void;
}) {
  const [exceptions, setExceptions] = useState<VenueOpeningException[]>(() =>
    parseVenueOpeningExceptions(venue.venue_opening_exceptions),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  const [rangeStart, setRangeStart] = useState<string | null>(null);
  const [rangeEnd, setRangeEnd] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formType, setFormType] = useState<'closed' | 'custom'>('closed');
  const [p1Open, setP1Open] = useState('09:00');
  const [p1Close, setP1Close] = useState('17:00');
  const [p2Open, setP2Open] = useState('');
  const [p2Close, setP2Close] = useState('');
  const [reason, setReason] = useState('');

  useEffect(() => {
    setExceptions(parseVenueOpeningExceptions(venue.venue_opening_exceptions));
  }, [venue.venue_opening_exceptions]);

  const calendarExceptions = useMemo(() => exceptionsToCalendarMap(exceptions, year, month), [exceptions, year, month]);

  const editing = editingId ? exceptions.find((e) => e.id === editingId) ?? null : null;

  const resetFormDefaults = useCallback(() => {
    setFormType('closed');
    setP1Open('09:00');
    setP1Close('17:00');
    setP2Open('');
    setP2Close('');
    setReason('');
  }, []);

  const loadExceptionIntoForm = useCallback((ex: VenueOpeningException) => {
    setReason(ex.reason ?? '');
    if (ex.closed) {
      setFormType('closed');
    } else {
      setFormType('custom');
      const p = ex.periods?.[0];
      setP1Open(p?.open.slice(0, 5) ?? '09:00');
      setP1Close(p?.close.slice(0, 5) ?? '17:00');
      const p2 = ex.periods?.[1];
      if (p2) {
        setP2Open(p2.open.slice(0, 5));
        setP2Close(p2.close.slice(0, 5));
      } else {
        setP2Open('');
        setP2Close('');
      }
    }
  }, []);

  function handleDayClick(ymd: string) {
    setError(null);
    const hit = findExceptionForDay(exceptions, ymd);
    if (hit) {
      setEditingId(hit.id);
      loadExceptionIntoForm(hit);
      setRangeStart(null);
      setRangeEnd(null);
      return;
    }
    setEditingId(null);
    resetFormDefaults();
    if (!rangeStart) {
      setRangeStart(ymd);
      setRangeEnd(null);
      return;
    }
    if (!rangeEnd) {
      const [a, b] = ymd < rangeStart ? [ymd, rangeStart] : [rangeStart, ymd];
      setRangeStart(a);
      setRangeEnd(b);
      return;
    }
    setRangeStart(ymd);
    setRangeEnd(null);
  }

  function applyRangeAsNewException() {
    if (!rangeStart) {
      setError('Tap a day to start a range, then another day to complete it (or Apply for a single day).');
      return;
    }
    const end = rangeEnd ?? rangeStart;
    if (end < rangeStart) {
      setError('End date must be on or after the start date.');
      return;
    }
    const dates = eachDateInRangeInclusive(rangeStart, end);
    if (dates.length > MAX_RANGE_DAYS) {
      setError(`Date range cannot exceed ${MAX_RANGE_DAYS} days.`);
      return;
    }
    const candidate = { date_start: rangeStart, date_end: end };
    const others = exceptions.filter((e) => e.id !== editingId);
    for (const ex of others) {
      if (rangesOverlap(candidate, ex)) {
        setError('That range overlaps another amendment. Remove or edit the other entry first.');
        return;
      }
    }

    const id = crypto.randomUUID();
    const periods: { open: string; close: string }[] =
      formType === 'custom'
        ? p2Open && p2Close
          ? [
              { open: p1Open.slice(0, 5), close: p1Close.slice(0, 5) },
              { open: p2Open.slice(0, 5), close: p2Close.slice(0, 5) },
            ]
          : [{ open: p1Open.slice(0, 5), close: p1Close.slice(0, 5) }]
        : [];

    const row: VenueOpeningException =
      formType === 'closed'
        ? {
            id,
            date_start: rangeStart,
            date_end: end,
            closed: true,
            reason: reason.trim() || null,
          }
        : {
            id,
            date_start: rangeStart,
            date_end: end,
            closed: false,
            periods,
            reason: reason.trim() || null,
          };

    setExceptions((prev) => [...prev.filter((e) => e.id !== editingId), row]);
    setRangeStart(null);
    setRangeEnd(null);
    setEditingId(null);
    resetFormDefaults();
    setError(null);
  }

  function removeEditing() {
    if (!editingId) return;
    setExceptions((prev) => prev.filter((e) => e.id !== editingId));
    setEditingId(null);
    resetFormDefaults();
    setError(null);
  }

  function updateEditingInPlace() {
    if (!editing) return;
    const periods: { open: string; close: string }[] =
      formType === 'custom'
        ? p2Open && p2Close
          ? [
              { open: p1Open.slice(0, 5), close: p1Close.slice(0, 5) },
              { open: p2Open.slice(0, 5), close: p2Close.slice(0, 5) },
            ]
          : [{ open: p1Open.slice(0, 5), close: p1Close.slice(0, 5) }]
        : [];

    const updated: VenueOpeningException =
      formType === 'closed'
        ? {
            id: editing.id,
            date_start: editing.date_start,
            date_end: editing.date_end,
            closed: true,
            reason: reason.trim() || null,
          }
        : {
            id: editing.id,
            date_start: editing.date_start,
            date_end: editing.date_end,
            closed: false,
            periods,
            reason: reason.trim() || null,
          };

    const others = exceptions.filter((e) => e.id !== editing.id);
    for (const ex of others) {
      if (rangesOverlap(updated, ex)) {
        setError('Updated range overlaps another amendment.');
        return;
      }
    }
    setExceptions((prev) => prev.map((e) => (e.id === editing.id ? updated : e)));
    setError(null);
  }

  async function saveAll() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/venue/venue-opening-exceptions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ exceptions }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof j.error === 'string' ? j.error : 'Failed to save');
      }
      onUpdate({ venue_opening_exceptions: j.exceptions ?? exceptions });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="mt-8 rounded-lg border border-neutral-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-neutral-900">Closures and Amended Hours</h2>
      <p className="mt-1 text-sm text-neutral-600">
        Mark dates when you are fully closed, or set different opening times for specific days (for example shorter days,
        late opening, or longer hours than usual). First tap starts a range; second tap completes it. Tap a highlighted day
        to edit or remove that entry, then save.
      </p>

      <div className="mt-4 max-w-2xl">
        <ResourceExceptionsCalendar
          year={year}
          month={month}
          onPrevMonth={() => setNow((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))}
          onNextMonth={() => setNow((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))}
          exceptions={calendarExceptions}
          rangeStart={rangeStart}
          rangeEnd={rangeEnd}
          editingDay={editing ? editing.date_start : null}
          onDayClick={handleDayClick}
        />
      </div>

      {editing ? (
        <div className="mt-4 rounded-lg border border-neutral-300 bg-neutral-50 p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Amendment</p>
              <p className="text-sm font-medium text-neutral-900">
                {editing.date_start === editing.date_end
                  ? editing.date_start
                  : `${editing.date_start} – ${editing.date_end}`}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setEditingId(null);
                resetFormDefaults();
              }}
              className="text-xs font-medium text-neutral-600 hover:text-neutral-900"
            >
              Close
            </button>
          </div>
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <div>
              <label className="mb-1 block text-xs text-neutral-600">Closure or amended hours</label>
              <select
                value={formType}
                onChange={(e) => setFormType(e.target.value as 'closed' | 'custom')}
                className="rounded-lg border border-neutral-200 bg-white px-2 py-1.5 text-sm"
              >
                <option value="closed">Closed (not open)</option>
                <option value="custom">Amended hours (custom times)</option>
              </select>
            </div>
            {formType === 'custom' && (
              <>
                <p className="col-span-full w-full text-xs text-neutral-500">
                  Enter the times you are open on these dates—they can be shorter or longer than your usual weekly hours.
                </p>
                <div>
                  <label className="mb-1 block text-xs text-neutral-600">From</label>
                  <input
                    type="time"
                    value={p1Open}
                    onChange={(e) => setP1Open(e.target.value)}
                    className="rounded border border-neutral-200 bg-white px-2 py-1.5 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-neutral-600">To</label>
                  <input
                    type="time"
                    value={p1Close}
                    onChange={(e) => setP1Close(e.target.value)}
                    className="rounded border border-neutral-200 bg-white px-2 py-1.5 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-neutral-600">Second period from (optional)</label>
                  <input
                    type="time"
                    value={p2Open}
                    onChange={(e) => setP2Open(e.target.value)}
                    className="rounded border border-neutral-200 bg-white px-2 py-1.5 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-neutral-600">To</label>
                  <input
                    type="time"
                    value={p2Close}
                    onChange={(e) => setP2Close(e.target.value)}
                    className="rounded border border-neutral-200 bg-white px-2 py-1.5 text-sm"
                  />
                </div>
              </>
            )}
            <div className="min-w-[12rem] flex-1">
              <label className="mb-1 block text-xs text-neutral-600">Note (optional)</label>
              <input
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="w-full rounded border border-neutral-200 bg-white px-2 py-1.5 text-sm"
                placeholder="e.g. Late opening, extended hours, staff training"
              />
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void updateEditingInPlace()}
              className="rounded-lg bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-neutral-800"
            >
              Save changes
            </button>
            <button
              type="button"
              onClick={() => void removeEditing()}
              className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
            >
              Remove
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-4 rounded-lg border border-neutral-200 bg-neutral-50/80 p-4">
          <p className="text-xs font-semibold text-neutral-800">Add closure or amended hours</p>
          <p className="mt-1 text-xs text-neutral-500">
            Choose closure or amended hours below, select dates on the calendar, then add to the calendar.
          </p>
          <div className="mt-2 flex flex-wrap items-end gap-2">
            <div>
              <label className="mb-1 block text-xs text-neutral-600">Closure or amended hours</label>
              <select
                value={formType}
                onChange={(e) => setFormType(e.target.value as 'closed' | 'custom')}
                className="rounded-lg border border-neutral-200 bg-white px-2 py-1.5 text-sm"
              >
                <option value="closed">Closed (not open)</option>
                <option value="custom">Amended hours (custom times)</option>
              </select>
            </div>
            {formType === 'custom' && (
              <>
                <div>
                  <label className="mb-1 block text-xs text-neutral-600">From</label>
                  <input
                    type="time"
                    value={p1Open}
                    onChange={(e) => setP1Open(e.target.value)}
                    className="rounded border border-neutral-200 bg-white px-2 py-1.5 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-neutral-600">To</label>
                  <input
                    type="time"
                    value={p1Close}
                    onChange={(e) => setP1Close(e.target.value)}
                    className="rounded border border-neutral-200 bg-white px-2 py-1.5 text-sm"
                  />
                </div>
              </>
            )}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void applyRangeAsNewException()}
              disabled={!rangeStart}
              className="rounded-lg bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
            >
              Add to calendar
            </button>
            <button
              type="button"
              onClick={() => {
                setRangeStart(null);
                setRangeEnd(null);
              }}
              className="rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
            >
              Clear selection
            </button>
            {rangeStart && (
              <span className="text-xs text-neutral-500">
                {rangeEnd ? `${rangeStart} → ${rangeEnd}` : `${rangeStart} (single day — tap Add to calendar)`}
              </span>
            )}
          </div>
        </div>
      )}

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      <button
        type="button"
        onClick={() => void saveAll()}
        disabled={saving}
        className="mt-4 rounded bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
      >
        {saving ? 'Saving…' : 'Save changes'}
      </button>
    </section>
  );
}

function RestaurantBlocksEditor() {
  const [blocks, setBlocks] = useState<RestaurantBlock[]>([]);
  const [services, setServices] = useState<Array<{ id: string; name: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  const [rangeStart, setRangeStart] = useState<string | null>(null);
  const [rangeEnd, setRangeEnd] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [draft, setDraft] = useState({
    block_type: 'closed' as RestaurantBlock['block_type'],
    service_id: '',
    date_start: '',
    date_end: '',
    time_start: null as string | null,
    time_end: null as string | null,
    override_max_covers: null as number | null,
    reason: '',
    yield_max_bookings: null as number | null,
    yield_interval: null as number | null,
    yield_buffer: null as number | null,
    yield_duration: null as number | null,
  });

  useEffect(() => {
    async function load() {
      try {
        const [bRes, sRes] = await Promise.all([
          fetch('/api/venue/availability-blocks'),
          fetch('/api/venue/services'),
        ]);
        if (bRes.ok) {
          const j = await bRes.json();
          setBlocks(j.blocks ?? []);
        }
        if (sRes.ok) {
          const j = await sRes.json();
          const list = (j.services ?? []) as Array<{ id: string; name: string }>;
          setServices(list);
        }
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  const calendarMap = useMemo(() => blocksToCalendarMap(blocks, year, month), [blocks, year, month]);

  const editing = editingId ? blocks.find((b) => b.id === editingId) ?? null : null;

  useEffect(() => {
    if (!editing) return;
    setDraft({
      block_type: editing.block_type,
      service_id: editing.service_id ?? '',
      date_start: editing.date_start,
      date_end: editing.date_end,
      time_start: editing.time_start,
      time_end: editing.time_end,
      override_max_covers: editing.override_max_covers,
      reason: editing.reason ?? '',
      yield_max_bookings: editing.yield_overrides?.max_bookings_per_slot ?? null,
      yield_interval: editing.yield_overrides?.slot_interval_minutes ?? null,
      yield_buffer: editing.yield_overrides?.buffer_minutes ?? null,
      yield_duration: editing.yield_overrides?.duration_minutes ?? null,
    });
  }, [editing]);

  function handleDayClick(ymd: string) {
    setError(null);
    const b = bestBlockForDay(blocks, ymd);
    if (b) {
      setEditingId(b.id);
      setRangeStart(null);
      setRangeEnd(null);
      return;
    }
    setEditingId(null);
    if (!rangeStart) {
      setRangeStart(ymd);
      setRangeEnd(null);
      setDraft((d) => ({ ...d, date_start: ymd, date_end: ymd }));
      return;
    }
    if (!rangeEnd) {
      const [a, c] = ymd < rangeStart ? [ymd, rangeStart] : [rangeStart, ymd];
      setRangeStart(a);
      setRangeEnd(c);
      setDraft((d) => ({ ...d, date_start: a, date_end: c }));
      return;
    }
    setRangeStart(ymd);
    setRangeEnd(null);
    setDraft((d) => ({ ...d, date_start: ymd, date_end: ymd }));
  }

  async function createBlock() {
    if (!draft.date_start || !draft.date_end) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/venue/availability-blocks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          block_type: draft.block_type,
          service_id: draft.service_id || null,
          date_start: draft.date_start,
          date_end: draft.date_end,
          time_start: draft.time_start || null,
          time_end: draft.time_end || null,
          reason: draft.reason || null,
          override_max_covers: draft.block_type === 'reduced_capacity' ? draft.override_max_covers : null,
          yield_overrides:
            draft.block_type === 'reduced_capacity'
              ? (() => {
                  const o: Record<string, number> = {};
                  if (draft.yield_max_bookings != null) o.max_bookings_per_slot = draft.yield_max_bookings;
                  if (draft.yield_interval != null) o.slot_interval_minutes = draft.yield_interval;
                  if (draft.yield_buffer != null) o.buffer_minutes = draft.yield_buffer;
                  if (draft.yield_duration != null) o.duration_minutes = draft.yield_duration;
                  return Object.keys(o).length > 0 ? o : null;
                })()
              : null,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof j.error === 'string' ? j.error : 'Failed');
      setBlocks((prev) => [...prev, j.block]);
      setRangeStart(null);
      setRangeEnd(null);
      setEditingId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create');
    } finally {
      setSaving(false);
    }
  }

  async function patchBlock() {
    if (!editing) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/venue/availability-blocks', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editing.id,
          block_type: draft.block_type,
          service_id: draft.service_id || null,
          date_start: draft.date_start,
          date_end: draft.date_end,
          time_start: draft.time_start || null,
          time_end: draft.time_end || null,
          reason: draft.reason || null,
          override_max_covers: draft.block_type === 'reduced_capacity' ? draft.override_max_covers : null,
          yield_overrides:
            draft.block_type === 'reduced_capacity'
              ? (() => {
                  const o: Record<string, number> = {};
                  if (draft.yield_max_bookings != null) o.max_bookings_per_slot = draft.yield_max_bookings;
                  if (draft.yield_interval != null) o.slot_interval_minutes = draft.yield_interval;
                  if (draft.yield_buffer != null) o.buffer_minutes = draft.yield_buffer;
                  if (draft.yield_duration != null) o.duration_minutes = draft.yield_duration;
                  return Object.keys(o).length > 0 ? o : null;
                })()
              : null,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof j.error === 'string' ? j.error : 'Failed');
      setBlocks((prev) => prev.map((b) => (b.id === editing.id ? j.block : b)));
      setEditingId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  async function deleteBlock(id: string) {
    if (!confirm('Remove this closure/block?')) return;
    try {
      await fetch('/api/venue/availability-blocks', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      setBlocks((prev) => prev.filter((b) => b.id !== id));
      if (editingId === id) setEditingId(null);
    } catch {
      setError('Failed to remove');
    }
  }

  if (loading) {
    return (
      <section className="mt-8 flex justify-center rounded-lg border border-neutral-200 bg-white p-8 shadow-sm">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
      </section>
    );
  }

  return (
    <section className="mt-8 rounded-lg border border-neutral-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-neutral-900">Closures and capacity blocks</h2>
      <p className="mt-1 text-sm text-neutral-600">
        Set full or partial closures, reduced capacity, or special events. Tap the calendar twice to choose a date range (or
        one day), then complete the form and add. Tap a highlighted day to edit or delete that block.
      </p>

      <div className="mt-4 max-w-2xl">
        <ResourceExceptionsCalendar
          year={year}
          month={month}
          onPrevMonth={() => setNow((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))}
          onNextMonth={() => setNow((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))}
          exceptions={calendarMap}
          rangeStart={rangeStart}
          rangeEnd={rangeEnd}
          editingDay={editing ? editing.date_start : null}
          onDayClick={handleDayClick}
        />
      </div>

      {editing ? (
        <div className="mt-4 space-y-4 rounded-lg border border-neutral-200 p-4">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-medium text-neutral-800">Edit block</p>
            <button
              type="button"
              className="text-xs text-neutral-600 hover:text-neutral-900"
              onClick={() => setEditingId(null)}
            >
              Close
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="mb-1 block text-xs font-medium text-neutral-600">Type</label>
              <select
                value={draft.block_type}
                onChange={(e) => setDraft({ ...draft, block_type: e.target.value as RestaurantBlock['block_type'] })}
                className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm"
              >
                <option value="closed">Closed</option>
                <option value="reduced_capacity">Reduced capacity</option>
                <option value="special_event">Special event</option>
              </select>
            </div>
            <div className="col-span-2">
              <label className="mb-1 block text-xs font-medium text-neutral-600">Service scope</label>
              <select
                value={draft.service_id}
                onChange={(e) => setDraft({ ...draft, service_id: e.target.value })}
                className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm"
              >
                <option value="">All services</option>
                {services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-600">Start date</label>
              <input
                type="date"
                value={draft.date_start}
                onChange={(e) => setDraft({ ...draft, date_start: e.target.value })}
                className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-600">End date</label>
              <input
                type="date"
                value={draft.date_end}
                onChange={(e) => setDraft({ ...draft, date_end: e.target.value })}
                className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-600">Start time (optional)</label>
              <input
                type="time"
                value={draft.time_start ?? ''}
                onChange={(e) => setDraft({ ...draft, time_start: e.target.value || null })}
                className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-600">End time (optional)</label>
              <input
                type="time"
                value={draft.time_end ?? ''}
                onChange={(e) => setDraft({ ...draft, time_end: e.target.value || null })}
                className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm"
              />
            </div>
            {draft.block_type === 'reduced_capacity' && (
              <>
                <div className="col-span-2">
                  <label className="mb-1 block text-xs font-medium text-neutral-600">Override max covers</label>
                  <NumericInput
                    min={0}
                    value={draft.override_max_covers}
                    onChange={(v) => setDraft({ ...draft, override_max_covers: v })}
                    className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm"
                  />
                </div>
                <div className="col-span-2 grid grid-cols-2 gap-2 rounded-lg border border-amber-100 bg-amber-50/30 p-2">
                  <p className="col-span-2 text-[10px] font-medium text-amber-900">Optional yield overrides</p>
                  <div>
                    <label className="text-[10px] text-neutral-600">Max bookings / slot</label>
                    <NumericInput
                      min={1}
                      value={draft.yield_max_bookings}
                      onChange={(v) => setDraft({ ...draft, yield_max_bookings: v })}
                      className="w-full rounded border border-neutral-200 px-2 py-1 text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-neutral-600">Slot interval (min)</label>
                    <NumericInput
                      min={5}
                      value={draft.yield_interval}
                      onChange={(v) => setDraft({ ...draft, yield_interval: v })}
                      className="w-full rounded border border-neutral-200 px-2 py-1 text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-neutral-600">Buffer (min)</label>
                    <NumericInput
                      min={0}
                      value={draft.yield_buffer}
                      onChange={(v) => setDraft({ ...draft, yield_buffer: v })}
                      className="w-full rounded border border-neutral-200 px-2 py-1 text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-neutral-600">Duration (min)</label>
                    <NumericInput
                      min={15}
                      value={draft.yield_duration}
                      onChange={(v) => setDraft({ ...draft, yield_duration: v })}
                      className="w-full rounded border border-neutral-200 px-2 py-1 text-sm"
                    />
                  </div>
                </div>
              </>
            )}
            <div className="col-span-2">
              <label className="mb-1 block text-xs font-medium text-neutral-600">Reason (optional)</label>
              <input
                type="text"
                value={draft.reason}
                onChange={(e) => setDraft({ ...draft, reason: e.target.value })}
                className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void patchBlock()}
              disabled={saving}
              className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save changes'}
            </button>
            <button
              type="button"
              onClick={() => void deleteBlock(editing.id)}
              className="rounded-lg border border-red-200 px-4 py-2 text-sm text-red-600 hover:bg-red-50"
            >
              Delete
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-4 space-y-4 rounded-lg border border-neutral-200 p-4">
          <p className="text-xs font-semibold text-neutral-800">New block</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="mb-1 block text-xs font-medium text-neutral-600">Type</label>
              <select
                value={draft.block_type}
                onChange={(e) => setDraft({ ...draft, block_type: e.target.value as RestaurantBlock['block_type'] })}
                className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm"
              >
                <option value="closed">Closed</option>
                <option value="reduced_capacity">Reduced capacity</option>
                <option value="special_event">Special event</option>
              </select>
            </div>
            <div className="col-span-2">
              <label className="mb-1 block text-xs font-medium text-neutral-600">Service scope</label>
              <select
                value={draft.service_id}
                onChange={(e) => setDraft({ ...draft, service_id: e.target.value })}
                className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm"
              >
                <option value="">All services</option>
                {services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-600">Start date</label>
              <input
                type="date"
                value={draft.date_start}
                onChange={(e) => setDraft({ ...draft, date_start: e.target.value, date_end: draft.date_end || e.target.value })}
                className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-600">End date</label>
              <input
                type="date"
                value={draft.date_end}
                onChange={(e) => setDraft({ ...draft, date_end: e.target.value })}
                className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-600">Start time (optional)</label>
              <input
                type="time"
                value={draft.time_start ?? ''}
                onChange={(e) => setDraft({ ...draft, time_start: e.target.value || null })}
                className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-600">End time (optional)</label>
              <input
                type="time"
                value={draft.time_end ?? ''}
                onChange={(e) => setDraft({ ...draft, time_end: e.target.value || null })}
                className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm"
              />
            </div>
            {draft.block_type === 'reduced_capacity' && (
              <>
                <div className="col-span-2">
                  <label className="mb-1 block text-xs font-medium text-neutral-600">Override max covers</label>
                  <NumericInput
                    min={0}
                    value={draft.override_max_covers}
                    onChange={(v) => setDraft({ ...draft, override_max_covers: v })}
                    className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm"
                  />
                </div>
                <div className="col-span-2 grid grid-cols-2 gap-2 rounded-lg border border-amber-100 bg-amber-50/30 p-2">
                  <p className="col-span-2 text-[10px] font-medium text-amber-900">Optional yield overrides</p>
                  <div>
                    <label className="text-[10px] text-neutral-600">Max bookings / slot</label>
                    <NumericInput
                      min={1}
                      value={draft.yield_max_bookings}
                      onChange={(v) => setDraft({ ...draft, yield_max_bookings: v })}
                      className="w-full rounded border border-neutral-200 px-2 py-1 text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-neutral-600">Slot interval (min)</label>
                    <NumericInput
                      min={5}
                      value={draft.yield_interval}
                      onChange={(v) => setDraft({ ...draft, yield_interval: v })}
                      className="w-full rounded border border-neutral-200 px-2 py-1 text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-neutral-600">Buffer (min)</label>
                    <NumericInput
                      min={0}
                      value={draft.yield_buffer}
                      onChange={(v) => setDraft({ ...draft, yield_buffer: v })}
                      className="w-full rounded border border-neutral-200 px-2 py-1 text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-neutral-600">Duration (min)</label>
                    <NumericInput
                      min={15}
                      value={draft.yield_duration}
                      onChange={(v) => setDraft({ ...draft, yield_duration: v })}
                      className="w-full rounded border border-neutral-200 px-2 py-1 text-sm"
                    />
                  </div>
                </div>
              </>
            )}
            <div className="col-span-2">
              <label className="mb-1 block text-xs font-medium text-neutral-600">Reason (optional)</label>
              <input
                type="text"
                value={draft.reason}
                onChange={(e) => setDraft({ ...draft, reason: e.target.value })}
                className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void createBlock()}
              disabled={saving || !draft.date_start || !draft.date_end}
              className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
            >
              {saving ? 'Creating…' : 'Add to calendar'}
            </button>
            {rangeStart && (
              <span className="self-center text-xs text-neutral-500">
                {rangeEnd ? `Range ${rangeStart} → ${rangeEnd}` : `Start ${rangeStart}`}
              </span>
            )}
          </div>
        </div>
      )}

      <p className="mt-3 text-xs text-neutral-500">
        The same blocks apply under Dashboard → Availability → Closures. You can use either place; we may consolidate the
        older tab later.
      </p>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    </section>
  );
}
