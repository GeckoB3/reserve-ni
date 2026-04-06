'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { HelpTooltip } from '@/components/dashboard/HelpTooltip';
import { helpContent } from '@/lib/help-content';
import { NumericInput } from '@/components/ui/NumericInput';

const calHelp = helpContent.availabilityCalendar;

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

interface Service {
  id: string;
  name: string;
}

interface Block {
  id: string;
  service_id: string | null;
  block_type: 'closed' | 'reduced_capacity' | 'special_event';
  date_start: string;
  date_end: string;
  time_start: string | null;
  time_end: string | null;
  override_max_covers: number | null;
  reason: string | null;
  yield_overrides?: {
    max_bookings_per_slot?: number;
    slot_interval_minutes?: number;
    buffer_minutes?: number;
    duration_minutes?: number;
  } | null;
}

interface ScheduleExc {
  id: string;
  service_id: string;
  date_start: string;
  date_end: string;
  is_closed: boolean;
  opens_extra_day: boolean;
  start_time: string | null;
  end_time: string | null;
  last_booking_time: string | null;
  reason: string | null;
}

interface RestrictionExc {
  id: string;
  service_id: string | null;
  date_start: string;
  date_end: string;
  time_start: string | null;
  time_end: string | null;
  min_advance_minutes: number | null;
  max_advance_days: number | null;
  min_party_size_online: number | null;
  max_party_size_online: number | null;
  reason: string | null;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function blocksTouchingDay(blocks: Block[], iso: string): Block[] {
  return blocks.filter((b) => iso >= b.date_start && iso <= b.date_end);
}

function blockDotClass(t: Block['block_type']): string {
  if (t === 'closed') return 'bg-red-500';
  if (t === 'reduced_capacity') return 'bg-amber-500';
  return 'bg-brand-500';
}

interface Props {
  services: Service[];
  showToast: (msg: string) => void;
}

export function AvailabilityCalendarTab({ services, showToast }: Props) {
  const today = new Date().toISOString().slice(0, 10);
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return { y: d.getFullYear(), m: d.getMonth() };
  });
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [scheduleExcs, setScheduleExcs] = useState<ScheduleExc[]>([]);
  const [restrictionExcs, setRestrictionExcs] = useState<RestrictionExc[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState<string | null>(today);
  const [editingBlockId, setEditingBlockId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    block_type: 'closed' as Block['block_type'],
    service_id: '' as string,
    date_start: today,
    date_end: today,
    time_start: null as string | null,
    time_end: null as string | null,
    override_max_covers: null as number | null,
    reason: '',
    yield_max_bookings: null as number | null,
    yield_interval: null as number | null,
    yield_buffer: null as number | null,
    yield_duration: null as number | null,
  });

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [bRes, sRes, rRes] = await Promise.all([
        fetch('/api/venue/availability-blocks'),
        fetch('/api/venue/service-schedule-exceptions'),
        fetch('/api/venue/booking-restriction-exceptions'),
      ]);
      if (bRes.ok) {
        const j = await bRes.json();
        setBlocks(j.blocks ?? []);
      }
      if (sRes.ok) {
        const j = await sRes.json();
        setScheduleExcs(j.exceptions ?? []);
      }
      if (rRes.ok) {
        const j = await rRes.json();
        setRestrictionExcs(j.exceptions ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const calendarCells = useMemo(() => {
    const first = new Date(cursor.y, cursor.m, 1);
    const startPad = first.getDay();
    const dim = new Date(cursor.y, cursor.m + 1, 0).getDate();
    const cells: Array<{ iso: string | null; inMonth: boolean }> = [];
    for (let i = 0; i < startPad; i++) cells.push({ iso: null, inMonth: false });
    for (let d = 1; d <= dim; d++) {
      const iso = `${cursor.y}-${pad2(cursor.m + 1)}-${pad2(d)}`;
      cells.push({ iso, inMonth: true });
    }
    while (cells.length % 7 !== 0) cells.push({ iso: null, inMonth: false });
    return cells;
  }, [cursor]);

  const dayBlocks = selectedDay ? blocksTouchingDay(blocks, selectedDay) : [];

  function resetFormForDay(iso: string) {
    setEditingBlockId(null);
    setForm({
      block_type: 'closed',
      service_id: '',
      date_start: iso,
      date_end: iso,
      time_start: null,
      time_end: null,
      override_max_covers: null,
      reason: '',
      yield_max_bookings: null,
      yield_interval: null,
      yield_buffer: null,
      yield_duration: null,
    });
  }

  function loadBlockIntoForm(b: Block) {
    setEditingBlockId(b.id);
    const y = b.yield_overrides ?? {};
    setForm({
      block_type: b.block_type,
      service_id: b.service_id ?? '',
      date_start: b.date_start,
      date_end: b.date_end,
      time_start: b.time_start,
      time_end: b.time_end,
      override_max_covers: b.override_max_covers,
      reason: b.reason ?? '',
      yield_max_bookings: y.max_bookings_per_slot ?? null,
      yield_interval: y.slot_interval_minutes ?? null,
      yield_buffer: y.buffer_minutes ?? null,
      yield_duration: y.duration_minutes ?? null,
    });
  }

  function buildYieldOverrides(): Block['yield_overrides'] {
    if (form.block_type !== 'reduced_capacity') return null;
    const o: NonNullable<Block['yield_overrides']> = {};
    if (form.yield_max_bookings != null) o.max_bookings_per_slot = form.yield_max_bookings;
    if (form.yield_interval != null) o.slot_interval_minutes = form.yield_interval;
    if (form.yield_buffer != null) o.buffer_minutes = form.yield_buffer;
    if (form.yield_duration != null) o.duration_minutes = form.yield_duration;
    return Object.keys(o).length > 0 ? o : null;
  }

  async function saveBlock() {
    if (!form.date_start || !form.date_end) return;
    setSaving(true);
    try {
      const payload = {
        block_type: form.block_type,
        service_id: form.service_id || null,
        date_start: form.date_start,
        date_end: form.date_end,
        time_start: form.time_start || null,
        time_end: form.time_end || null,
        override_max_covers: form.block_type === 'reduced_capacity' ? form.override_max_covers : null,
        reason: form.reason || null,
        yield_overrides: buildYieldOverrides(),
      };

      if (editingBlockId) {
        const res = await fetch('/api/venue/availability-blocks', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: editingBlockId, ...payload }),
        });
        if (!res.ok) throw new Error();
        const j = await res.json();
        setBlocks((prev) => prev.map((x) => (x.id === editingBlockId ? j.block : x)));
        showToast('Block updated');
      } else {
        const res = await fetch('/api/venue/availability-blocks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error();
        const j = await res.json();
        setBlocks((prev) => [...prev, j.block]);
        showToast('Block created');
      }
      setEditingBlockId(null);
      if (selectedDay) resetFormForDay(selectedDay);
    } catch {
      showToast('Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function deleteBlock(id: string) {
    if (!confirm('Remove this block?')) return;
    try {
      const res = await fetch('/api/venue/availability-blocks', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) throw new Error();
      setBlocks((prev) => prev.filter((b) => b.id !== id));
      if (editingBlockId === id) {
        setEditingBlockId(null);
        if (selectedDay) resetFormForDay(selectedDay);
      }
      showToast('Removed');
    } catch {
      showToast('Delete failed');
    }
  }

  const monthLabel = new Date(cursor.y, cursor.m, 1).toLocaleString('en-GB', { month: 'long', year: 'numeric' });

  if (loading) {
    return (
      <div className="flex justify-center p-12">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
      </div>
    );
  }

  if (services.length === 0) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-6 text-sm text-amber-900">
        <p className="font-medium">Service-based availability is not set up yet.</p>
        <p className="mt-1 text-amber-800/90">Add at least one service under the Services tab to use the calendar, blocks, and date exceptions.</p>
      </div>
    );
  }

  return (
    <div className="space-y-10">
      <p className="text-sm text-slate-600">{calHelp.tabIntro}</p>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(320px,400px)]">
        <div>
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-800">{monthLabel}</h3>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => setCursor((c) => (c.m === 0 ? { y: c.y - 1, m: 11 } : { y: c.y, m: c.m - 1 }))}
                className="rounded-lg border border-slate-200 px-2 py-1 text-sm text-slate-600 hover:bg-slate-50"
              >
                Prev
              </button>
              <button
                type="button"
                onClick={() => {
                  const d = new Date();
                  setCursor({ y: d.getFullYear(), m: d.getMonth() });
                }}
                className="rounded-lg border border-slate-200 px-2 py-1 text-sm text-slate-600 hover:bg-slate-50"
              >
                Today
              </button>
              <button
                type="button"
                onClick={() => setCursor((c) => (c.m === 11 ? { y: c.y + 1, m: 0 } : { y: c.y, m: c.m + 1 }))}
                className="rounded-lg border border-slate-200 px-2 py-1 text-sm text-slate-600 hover:bg-slate-50"
              >
                Next
              </button>
            </div>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            {WEEKDAYS.map((d) => (
              <div key={d} className="py-1">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {calendarCells.map((cell, idx) => {
              const iso = cell.iso;
              if (!iso) {
                return <div key={`e-${idx}`} className="aspect-square rounded-lg bg-slate-50/50" />;
              }
              const touching = blocksTouchingDay(blocks, iso);
              const sel = selectedDay === iso;
              return (
                <button
                  key={iso}
                  type="button"
                  onClick={() => {
                    setSelectedDay(iso);
                    resetFormForDay(iso);
                  }}
                  className={[
                    'flex aspect-square flex-col items-center justify-start rounded-lg border p-1 text-xs transition-colors',
                    sel ? 'border-brand-400 bg-brand-50 ring-1 ring-brand-300' : 'border-slate-100 bg-white hover:border-slate-200',
                    !cell.inMonth ? 'opacity-40' : '',
                  ].join(' ')}
                >
                  <span className="font-semibold tabular-nums text-slate-800">{Number(iso.slice(8))}</span>
                  <span className="mt-0.5 flex flex-wrap justify-center gap-0.5">
                    {touching.slice(0, 3).map((b) => (
                      <span key={b.id} className={`h-1.5 w-1.5 rounded-full ${blockDotClass(b.block_type)}`} title={b.block_type} />
                    ))}
                    {touching.length > 3 && <span className="text-[8px] text-slate-400">+</span>}
                  </span>
                </button>
              );
            })}
          </div>
          <p className="mt-3 text-xs text-slate-500">
            <span className="mb-1 block font-medium text-slate-600">Legend</span>
            <span className="mr-2 inline-flex items-center gap-1">
              <span className="h-2 w-2 shrink-0 rounded-full bg-red-500" aria-hidden /> Closed
            </span>
            <span className="mr-2 inline-flex items-center gap-1">
              <span className="h-2 w-2 shrink-0 rounded-full bg-amber-500" aria-hidden /> Reduced capacity
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-2 w-2 shrink-0 rounded-full bg-brand-500" aria-hidden /> Special event
            </span>
          </p>
        </div>

        <div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50/40 p-4">
          <h3 className="text-sm font-semibold text-slate-800">
            {selectedDay ? `Blocks for ${selectedDay}` : 'Select a day'}
          </h3>
          {selectedDay && (
            <>
              <p className="text-xs text-slate-500">
                Lists every block whose date range includes this day. Click one to load it into the form below.
              </p>
              <ul className="max-h-40 space-y-2 overflow-y-auto text-xs">
                {dayBlocks.length === 0 && <li className="text-slate-400">No blocks on this day</li>}
                {dayBlocks.map((b) => (
                  <li key={b.id}>
                    <button
                      type="button"
                      onClick={() => loadBlockIntoForm(b)}
                      className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-left hover:border-brand-300"
                    >
                      <span className="font-medium capitalize">{b.block_type.replace(/_/g, ' ')}</span>
                      {b.date_start !== b.date_end && (
                        <span className="ml-1 text-slate-500">
                          ({b.date_start} – {b.date_end})
                        </span>
                      )}
                      {!b.service_id && <span className="ml-1 text-slate-400">· All services</span>}
                      {b.service_id && (
                        <span className="block text-slate-500">
                          Service: {services.find((s) => s.id === b.service_id)?.name ?? b.service_id.slice(0, 8)}
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}

          <div className="border-t border-slate-200 pt-4 space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {editingBlockId ? 'Edit block' : 'New block'}
            </h4>
            <p className="text-xs text-slate-500">
              Blocks apply to online availability for the dates and optional time window you set. Use Cancel edit to start a fresh block without clearing the selected day.
            </p>
            <div className="space-y-2">
              <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
                Block type <HelpTooltip content={calHelp.blockType} />
              </label>
              <select
                value={form.block_type}
                onChange={(e) => setForm({ ...form, block_type: e.target.value as Block['block_type'] })}
                className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
              >
                <option value="closed">Closed</option>
                <option value="reduced_capacity">Reduced capacity</option>
                <option value="special_event">Special event (no bookings)</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
                Service scope <HelpTooltip content={calHelp.serviceScope} />
              </label>
              <select
                value={form.service_id}
                onChange={(e) => setForm({ ...form, service_id: e.target.value })}
                className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
              >
                <option value="">All services</option>
                {services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="mb-0.5 flex items-center gap-1.5 text-xs font-medium text-slate-600">
                  Start date <HelpTooltip content={calHelp.dateRange} />
                </label>
                <input
                  type="date"
                  value={form.date_start}
                  onChange={(e) => setForm({ ...form, date_start: e.target.value })}
                  className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="mb-0.5 flex items-center gap-1.5 text-xs font-medium text-slate-600">
                  End date <HelpTooltip content={calHelp.dateRange} />
                </label>
                <input
                  type="date"
                  value={form.date_end}
                  onChange={(e) => setForm({ ...form, date_end: e.target.value })}
                  className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="mb-0.5 flex items-center gap-1.5 text-xs font-medium text-slate-600">
                  Time start (optional) <HelpTooltip content={calHelp.timeWindow} />
                </label>
                <input
                  type="time"
                  value={form.time_start ?? ''}
                  onChange={(e) => setForm({ ...form, time_start: e.target.value || null })}
                  className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="mb-0.5 flex items-center gap-1.5 text-xs font-medium text-slate-600">
                  Time end (optional) <HelpTooltip content={calHelp.timeWindow} />
                </label>
                <input
                  type="time"
                  value={form.time_end ?? ''}
                  onChange={(e) => setForm({ ...form, time_end: e.target.value || null })}
                  className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                />
              </div>
            </div>
            {form.block_type === 'reduced_capacity' && (
              <div className="space-y-2 rounded-lg border border-amber-100 bg-amber-50/40 p-3">
                <p className="text-xs font-medium text-amber-950">Reduced capacity limits</p>
                <p className="text-[11px] leading-snug text-amber-900/90">
                  Set a lower cover cap for this period. Optionally override spacing and turnover; leave a field blank to keep your normal capacity rules from the Capacity Rules tab.
                </p>
                <div>
                  <label className="mb-0.5 flex items-center gap-1.5 text-xs font-medium text-amber-900">
                    Max covers / slot <HelpTooltip content={calHelp.maxCoversPerSlot} maxWidth={300} />
                  </label>
                  <NumericInput
                    min={0}
                    value={form.override_max_covers}
                    onChange={(v) => setForm({ ...form, override_max_covers: v })}
                    className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                  />
                </div>
                <p className="text-[11px] font-medium text-amber-900/90">Optional yield overrides</p>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="mb-0.5 flex items-center gap-1.5 text-[11px] font-medium text-slate-700">
                      Max bookings / slot <HelpTooltip content={calHelp.maxBookingsPerSlot} maxWidth={300} />
                    </label>
                    <NumericInput
                      min={1}
                      value={form.yield_max_bookings}
                      onChange={(v) => setForm({ ...form, yield_max_bookings: v })}
                      className="w-full rounded border border-slate-200 px-2 py-1 text-sm"
                    />
                  </div>
                  <div>
                    <label className="mb-0.5 flex items-center gap-1.5 text-[11px] font-medium text-slate-700">
                      Slot interval (min) <HelpTooltip content={calHelp.slotInterval} maxWidth={300} />
                    </label>
                    <NumericInput
                      min={5}
                      value={form.yield_interval}
                      onChange={(v) => setForm({ ...form, yield_interval: v })}
                      className="w-full rounded border border-slate-200 px-2 py-1 text-sm"
                    />
                  </div>
                  <div>
                    <label className="mb-0.5 flex items-center gap-1.5 text-[11px] font-medium text-slate-700">
                      Buffer (min) <HelpTooltip content={calHelp.bufferMinutes} maxWidth={300} />
                    </label>
                    <NumericInput
                      min={0}
                      value={form.yield_buffer}
                      onChange={(v) => setForm({ ...form, yield_buffer: v })}
                      className="w-full rounded border border-slate-200 px-2 py-1 text-sm"
                    />
                  </div>
                  <div>
                    <label className="mb-0.5 flex items-center gap-1.5 text-[11px] font-medium text-slate-700">
                      Dining duration (min) <HelpTooltip content={calHelp.diningDurationOverride} maxWidth={300} />
                    </label>
                    <NumericInput
                      min={15}
                      value={form.yield_duration}
                      onChange={(v) => setForm({ ...form, yield_duration: v })}
                      className="w-full rounded border border-slate-200 px-2 py-1 text-sm"
                    />
                  </div>
                </div>
              </div>
            )}
            <div>
              <label className="mb-0.5 flex items-center gap-1.5 text-xs font-medium text-slate-600">
                Reason (optional) <HelpTooltip content={calHelp.reason} />
              </label>
              <input
                type="text"
                value={form.reason}
                onChange={(e) => setForm({ ...form, reason: e.target.value })}
                className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={saving || !form.date_start}
                onClick={() => void saveBlock()}
                className="rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
              >
                {saving ? 'Saving…' : editingBlockId ? 'Update' : 'Create'}
              </button>
              {editingBlockId && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingBlockId(null);
                      if (selectedDay) resetFormForDay(selectedDay);
                    }}
                    className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
                  >
                    Cancel edit
                  </button>
                  <button
                    type="button"
                    onClick={() => void deleteBlock(editingBlockId)}
                    className="rounded-lg border border-red-200 px-3 py-2 text-sm text-red-700 hover:bg-red-50"
                  >
                    Delete
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      <ScheduleExceptionsPanel services={services} items={scheduleExcs} onChange={() => void reload()} showToast={showToast} />
      <RestrictionExceptionsPanel services={services} items={restrictionExcs} onChange={() => void reload()} showToast={showToast} />
    </div>
  );
}

function ScheduleExceptionsPanel({
  services,
  items,
  onChange,
  showToast,
}: {
  services: Service[];
  items: ScheduleExc[];
  onChange: () => void;
  showToast: (m: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState({
    service_id: services[0]?.id ?? '',
    date_start: '',
    date_end: '',
    is_closed: false,
    opens_extra_day: false,
    start_time: '',
    end_time: '',
    last_booking_time: '',
    reason: '',
  });

  async function createExc() {
    if (!draft.service_id || !draft.date_start || !draft.date_end) return;
    setSaving(true);
    try {
      const res = await fetch('/api/venue/service-schedule-exceptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          service_id: draft.service_id,
          date_start: draft.date_start,
          date_end: draft.date_end,
          is_closed: draft.is_closed,
          opens_extra_day: draft.opens_extra_day,
          start_time: draft.start_time || null,
          end_time: draft.end_time || null,
          last_booking_time: draft.last_booking_time || null,
          reason: draft.reason || null,
        }),
      });
      if (!res.ok) throw new Error();
      showToast('Schedule exception saved');
      setOpen(false);
      onChange();
    } catch {
      showToast('Failed to save');
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!confirm('Delete this schedule exception?')) return;
    try {
      await fetch('/api/venue/service-schedule-exceptions', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      onChange();
      showToast('Removed');
    } catch {
      showToast('Delete failed');
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-800">Service hours exceptions</h3>
        <button type="button" onClick={() => setOpen(!open)} className="text-xs font-medium text-brand-600 hover:text-brand-700">
          {open ? 'Close form' : 'Add exception'}
        </button>
      </div>
      <p className="mt-1 text-xs text-slate-500">{calHelp.scheduleExceptions}</p>
      {open && (
        <div className="mt-4 grid gap-2 rounded-lg border border-slate-100 bg-slate-50/80 p-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
              Service <HelpTooltip content={calHelp.scheduleWhichService} />
            </label>
            <select
              value={draft.service_id}
              onChange={(e) => setDraft({ ...draft, service_id: e.target.value })}
              className="mt-0.5 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
            >
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
              From <HelpTooltip content={calHelp.dateRange} />
            </label>
            <input
              type="date"
              value={draft.date_start}
              onChange={(e) => setDraft({ ...draft, date_start: e.target.value })}
              className="mt-0.5 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
              To <HelpTooltip content={calHelp.dateRange} />
            </label>
            <input
              type="date"
              value={draft.date_end}
              onChange={(e) => setDraft({ ...draft, date_end: e.target.value })}
              className="mt-0.5 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={draft.is_closed}
              onChange={(e) => setDraft({ ...draft, is_closed: e.target.checked })}
            />
            <span className="flex items-center gap-1.5">
              Closed <HelpTooltip content={calHelp.scheduleClosed} />
            </span>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={draft.opens_extra_day}
              onChange={(e) => setDraft({ ...draft, opens_extra_day: e.target.checked })}
            />
            <span className="flex items-center gap-1.5">
              Open extra day <HelpTooltip content={calHelp.scheduleOpensExtraDay} />
            </span>
          </label>
          <p className="sm:col-span-2 text-[11px] text-slate-500">
            If not closed: leave times empty to use this service’s usual hours, or set all three times below to override for this date range.
          </p>
          <div>
            <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
              Start time <HelpTooltip content={calHelp.scheduleCustomTimes} />
            </label>
            <input
              type="time"
              value={draft.start_time}
              onChange={(e) => setDraft({ ...draft, start_time: e.target.value })}
              className="mt-0.5 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
              End time <HelpTooltip content={calHelp.scheduleCustomTimes} />
            </label>
            <input
              type="time"
              value={draft.end_time}
              onChange={(e) => setDraft({ ...draft, end_time: e.target.value })}
              className="mt-0.5 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
              Last booking time <HelpTooltip content={helpContent.services.lastBookingTime} />
            </label>
            <input
              type="time"
              value={draft.last_booking_time}
              onChange={(e) => setDraft({ ...draft, last_booking_time: e.target.value })}
              className="mt-0.5 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
              Reason (optional) <HelpTooltip content={calHelp.reason} />
            </label>
            <input
              type="text"
              value={draft.reason}
              onChange={(e) => setDraft({ ...draft, reason: e.target.value })}
              className="mt-0.5 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
            />
          </div>
          <button
            type="button"
            disabled={saving}
            onClick={() => void createExc()}
            className="sm:col-span-2 rounded-lg bg-slate-800 px-3 py-2 text-sm font-medium text-white hover:bg-slate-900 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save schedule exception'}
          </button>
        </div>
      )}
      <ul className="mt-3 divide-y divide-slate-100 text-xs">
        {items.length === 0 && <li className="py-2 text-slate-400">None configured</li>}
        {items.map((x) => (
          <li key={x.id} className="flex items-center justify-between gap-2 py-2">
            <span>
              <span className="font-medium">{services.find((s) => s.id === x.service_id)?.name ?? 'Service'}</span>
              {' · '}
              {x.date_start === x.date_end ? x.date_start : `${x.date_start} – ${x.date_end}`}
              {x.is_closed && <span className="ml-1 text-red-600">closed</span>}
              {x.opens_extra_day && !x.is_closed && <span className="ml-1 text-emerald-600">+day</span>}
              {x.start_time && x.end_time && (
                <span className="ml-1 text-slate-500">
                  {x.start_time}–{x.end_time}
                </span>
              )}
            </span>
            <button type="button" onClick={() => void remove(x.id)} className="text-red-500 hover:text-red-700">
              Remove
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function RestrictionExceptionsPanel({
  services,
  items,
  onChange,
  showToast,
}: {
  services: Service[];
  items: RestrictionExc[];
  onChange: () => void;
  showToast: (m: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState({
    service_id: '' as string,
    date_start: '',
    date_end: '',
    time_start: '',
    time_end: '',
    min_advance_minutes: null as number | null,
    max_advance_days: null as number | null,
    min_party_size_online: null as number | null,
    max_party_size_online: null as number | null,
    reason: '',
  });

  async function createExc() {
    if (!draft.date_start || !draft.date_end) return;
    setSaving(true);
    try {
      const res = await fetch('/api/venue/booking-restriction-exceptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          service_id: draft.service_id || null,
          date_start: draft.date_start,
          date_end: draft.date_end,
          time_start: draft.time_start || null,
          time_end: draft.time_end || null,
          min_advance_minutes: draft.min_advance_minutes,
          max_advance_days: draft.max_advance_days,
          min_party_size_online: draft.min_party_size_online,
          max_party_size_online: draft.max_party_size_online,
          reason: draft.reason || null,
        }),
      });
      if (!res.ok) throw new Error();
      showToast('Booking rule exception saved');
      setOpen(false);
      onChange();
    } catch {
      showToast('Failed to save');
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!confirm('Delete this exception?')) return;
    try {
      await fetch('/api/venue/booking-restriction-exceptions', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      onChange();
      showToast('Removed');
    } catch {
      showToast('Delete failed');
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-800">Booking rule exceptions</h3>
        <button type="button" onClick={() => setOpen(!open)} className="text-xs font-medium text-brand-600 hover:text-brand-700">
          {open ? 'Close form' : 'Add exception'}
        </button>
      </div>
      <p className="mt-1 text-xs text-slate-500">{calHelp.restrictionExceptions}</p>
      {open && (
        <div className="mt-4 grid gap-2 rounded-lg border border-slate-100 bg-slate-50/80 p-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
              Service (blank = all) <HelpTooltip content={calHelp.serviceScope} />
            </label>
            <select
              value={draft.service_id}
              onChange={(e) => setDraft({ ...draft, service_id: e.target.value })}
              className="mt-0.5 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
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
            <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
              From <HelpTooltip content={calHelp.dateRange} />
            </label>
            <input
              type="date"
              value={draft.date_start}
              onChange={(e) => setDraft({ ...draft, date_start: e.target.value })}
              className="mt-0.5 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
              To <HelpTooltip content={calHelp.dateRange} />
            </label>
            <input
              type="date"
              value={draft.date_end}
              onChange={(e) => setDraft({ ...draft, date_end: e.target.value })}
              className="mt-0.5 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
              Time start (optional) <HelpTooltip content={calHelp.restrictionTimeWindow} />
            </label>
            <input
              type="time"
              value={draft.time_start}
              onChange={(e) => setDraft({ ...draft, time_start: e.target.value })}
              className="mt-0.5 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
              Time end (optional) <HelpTooltip content={calHelp.restrictionTimeWindow} />
            </label>
            <input
              type="time"
              value={draft.time_end}
              onChange={(e) => setDraft({ ...draft, time_end: e.target.value })}
              className="mt-0.5 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
            />
          </div>
          <p className="sm:col-span-2 text-[11px] text-slate-500">
            Leave numeric fields blank to keep your normal booking rules for that setting; only filled-in values override.
          </p>
          <div>
            <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
              Min advance (min) <HelpTooltip content={helpContent.bookingRules.minAdvance} />
            </label>
            <NumericInput
              min={0}
              value={draft.min_advance_minutes}
              onChange={(v) => setDraft({ ...draft, min_advance_minutes: v })}
              className="mt-0.5 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
              Max advance (days) <HelpTooltip content={helpContent.bookingRules.maxAdvance} />
            </label>
            <NumericInput
              min={0}
              value={draft.max_advance_days}
              onChange={(v) => setDraft({ ...draft, max_advance_days: v })}
              className="mt-0.5 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
              Min party (online) <HelpTooltip content={helpContent.bookingRules.partySize} />
            </label>
            <NumericInput
              min={1}
              value={draft.min_party_size_online}
              onChange={(v) => setDraft({ ...draft, min_party_size_online: v })}
              className="mt-0.5 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
              Max party (online) <HelpTooltip content={helpContent.bookingRules.partySize} />
            </label>
            <NumericInput
              min={1}
              value={draft.max_party_size_online}
              onChange={(v) => setDraft({ ...draft, max_party_size_online: v })}
              className="mt-0.5 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
              Reason (optional) <HelpTooltip content={calHelp.reason} />
            </label>
            <input
              type="text"
              value={draft.reason}
              onChange={(e) => setDraft({ ...draft, reason: e.target.value })}
              className="mt-0.5 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
            />
          </div>
          <button
            type="button"
            disabled={saving}
            onClick={() => void createExc()}
            className="sm:col-span-2 rounded-lg bg-slate-800 px-3 py-2 text-sm font-medium text-white hover:bg-slate-900 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save booking rule exception'}
          </button>
        </div>
      )}
      <ul className="mt-3 divide-y divide-slate-100 text-xs">
        {items.length === 0 && <li className="py-2 text-slate-400">None configured</li>}
        {items.map((x) => (
          <li key={x.id} className="flex items-center justify-between gap-2 py-2">
            <span>
              {x.service_id ? services.find((s) => s.id === x.service_id)?.name ?? 'Service' : 'All services'}
              {' · '}
              {x.date_start === x.date_end ? x.date_start : `${x.date_start} – ${x.date_end}`}
              {x.time_start && x.time_end && (
                <span className="ml-1 text-slate-500">
                  {x.time_start}–{x.time_end}
                </span>
              )}
            </span>
            <button type="button" onClick={() => void remove(x.id)} className="text-red-500 hover:text-red-700">
              Remove
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
