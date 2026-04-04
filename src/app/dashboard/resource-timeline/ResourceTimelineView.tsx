'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Resource {
  id: string;
  name: string;
  resource_type: string | null;
  slot_interval_minutes: number;
  min_booking_minutes: number;
  max_booking_minutes: number;
  price_per_slot_pence: number | null;
  is_active: boolean;
  availability_hours: Record<string, Array<{ start: string; end: string }>> | null;
  availability_exceptions?: Record<string, { closed: true } | { periods: Array<{ start: string; end: string }> }> | null;
  sort_order: number;
}

interface ResourceBooking {
  id: string;
  booking_date: string;
  booking_time: string;
  booking_end_time: string | null;
  status: string;
  guest_name: string;
  party_size: number;
}

type DayHours = { enabled: boolean; start: string; end: string };
type WeekHours = Record<string, DayHours>;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DAY_LABELS: Array<{ key: string; label: string }> = [
  { key: '1', label: 'Monday' },
  { key: '2', label: 'Tuesday' },
  { key: '3', label: 'Wednesday' },
  { key: '4', label: 'Thursday' },
  { key: '5', label: 'Friday' },
  { key: '6', label: 'Saturday' },
  { key: '0', label: 'Sunday' },
];

const SLOT_OPTIONS = [15, 30, 45, 60, 90, 120];
const DURATION_OPTIONS = [15, 30, 45, 60, 90, 120, 180, 240, 360, 480, 720, 1440];
const RESOURCE_TYPE_SUGGESTIONS = ['Tennis Court', 'Meeting Room', 'Studio', 'Pitch', 'Equipment', 'Desk', 'Bay', 'Lane', 'Pod'];

const STATUS_COLOURS: Record<string, string> = {
  Confirmed: 'bg-blue-50 text-blue-800 border-blue-200',
  Pending: 'bg-orange-50 text-orange-900 border-orange-200',
  Seated: 'bg-violet-50 text-violet-900 border-violet-200',
  Completed: 'bg-emerald-50 text-emerald-900 border-emerald-200',
  'No-Show': 'bg-red-50 text-red-800 border-red-200',
  Cancelled: 'bg-slate-50 text-slate-500 border-slate-200',
};

function defaultWeekHours(): WeekHours {
  const h: WeekHours = {};
  for (const d of DAY_LABELS) {
    h[d.key] = d.key === '0' || d.key === '6'
      ? { enabled: false, start: '09:00', end: '17:00' }
      : { enabled: true, start: '09:00', end: '17:00' };
  }
  return h;
}

function weekHoursFromJSON(hours: Record<string, Array<{ start: string; end: string }>> | null | undefined): WeekHours {
  const result = defaultWeekHours();
  if (!hours) return result;
  for (const d of DAY_LABELS) {
    const ranges = hours[d.key];
    if (ranges && ranges.length > 0) {
      result[d.key] = { enabled: true, start: ranges[0].start, end: ranges[0].end };
    } else {
      result[d.key] = { ...result[d.key]!, enabled: false };
    }
  }
  return result;
}

function weekHoursToJSON(wh: WeekHours): Record<string, Array<{ start: string; end: string }>> {
  const result: Record<string, Array<{ start: string; end: string }>> = {};
  for (const d of DAY_LABELS) {
    const day = wh[d.key]!;
    if (day.enabled) {
      result[d.key] = [{ start: day.start, end: day.end }];
    }
  }
  return result;
}

function formatDuration(mins: number): string {
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function ResourceTimelineView({
  venueId,
  isAdmin = false,
  currency = 'GBP',
}: {
  venueId: string;
  isAdmin?: boolean;
  currency?: string;
}) {
  const sym = currency === 'EUR' ? '\u20ac' : '\u00a3';
  function formatPrice(pence: number): string {
    return `${sym}${(pence / 100).toFixed(2)}`;
  }

  const [resources, setResources] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form state
  const [formName, setFormName] = useState('');
  const [formType, setFormType] = useState('');
  const [formSlot, setFormSlot] = useState(60);
  const [formMin, setFormMin] = useState(60);
  const [formMax, setFormMax] = useState(480);
  const [formPrice, setFormPrice] = useState('');
  const [formActive, setFormActive] = useState(true);
  const [formHours, setFormHours] = useState<WeekHours>(defaultWeekHours);
  const [formExceptions, setFormExceptions] = useState<Record<string, { closed: true } | { periods: Array<{ start: string; end: string }> }>>({});
  const [formExceptionDate, setFormExceptionDate] = useState('');
  const [formExceptionType, setFormExceptionType] = useState<'closed' | 'custom'>('closed');
  const [formExceptionStart, setFormExceptionStart] = useState('09:00');
  const [formExceptionEnd, setFormExceptionEnd] = useState('17:00');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Bookings for selected resource
  const [bookingsDate, setBookingsDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [bookings, setBookings] = useState<ResourceBooking[]>([]);
  const [bookingsLoading, setBookingsLoading] = useState(false);

  const selected = useMemo(() => resources.find((r) => r.id === selectedId) ?? null, [resources, selectedId]);

  // Fetch resources
  const fetchResources = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/venue/resources');
      const data = await res.json();
      setResources(data.resources ?? []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchResources(); }, [fetchResources]);

  // Fetch bookings for selected resource
  useEffect(() => {
    if (!selectedId || showForm) { setBookings([]); return; }
    let cancelled = false;
    setBookingsLoading(true);
    (async () => {
      try {
        const res = await fetch(`/api/venue/bookings/list?date=${bookingsDate}&resource_id=${selectedId}`);
        if (!res.ok) { setBookings([]); return; }
        const data = await res.json();
        if (cancelled) return;
        const rows = (data.bookings ?? []) as Array<Record<string, unknown>>;
        setBookings(
          rows
            .filter((b) => (b.resource_id === selectedId || b.calendar_id === selectedId))
            .map((b) => ({
              id: b.id as string,
              booking_date: b.booking_date as string,
              booking_time: ((b.booking_time as string) ?? '').slice(0, 5),
              booking_end_time: b.booking_end_time ? (b.booking_end_time as string).slice(0, 5) : null,
              status: b.status as string,
              guest_name: (b.guest_name as string) ?? 'Guest',
              party_size: (b.party_size as number) ?? 1,
            }))
            .sort((a, b) => a.booking_time.localeCompare(b.booking_time)),
        );
      } catch {
        if (!cancelled) setBookings([]);
      } finally {
        if (!cancelled) setBookingsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [selectedId, bookingsDate, showForm]);

  // Select first resource on load
  useEffect(() => {
    if (!selectedId && resources.length > 0) setSelectedId(resources[0].id);
  }, [resources, selectedId]);

  // Form helpers
  function openCreate() {
    setEditingId(null);
    setFormName('');
    setFormType('');
    setFormSlot(60);
    setFormMin(60);
    setFormMax(480);
    setFormPrice('');
    setFormActive(true);
    setFormHours(defaultWeekHours());
    setFormExceptions({});
    setFormExceptionDate('');
    setError(null);
    setShowForm(true);
  }

  function openEdit(r: Resource) {
    setEditingId(r.id);
    setFormName(r.name);
    setFormType(r.resource_type ?? '');
    setFormSlot(r.slot_interval_minutes);
    setFormMin(r.min_booking_minutes);
    setFormMax(r.max_booking_minutes);
    setFormPrice(r.price_per_slot_pence != null ? (r.price_per_slot_pence / 100).toFixed(2) : '');
    setFormActive(r.is_active);
    setFormHours(weekHoursFromJSON(r.availability_hours));
    setFormExceptions(r.availability_exceptions ? { ...r.availability_exceptions } : {});
    setFormExceptionDate('');
    setError(null);
    setShowForm(true);
  }

  function addException() {
    if (!formExceptionDate) return;
    setFormExceptions((prev) => ({
      ...prev,
      [formExceptionDate]: formExceptionType === 'closed'
        ? { closed: true as const }
        : { periods: [{ start: formExceptionStart, end: formExceptionEnd }] },
    }));
    setFormExceptionDate('');
  }

  function removeException(dateKey: string) {
    setFormExceptions((prev) => {
      const next = { ...prev };
      delete next[dateKey];
      return next;
    });
  }

  async function handleSave() {
    if (!formName.trim()) { setError('Resource name is required.'); return; }
    if (formMin > formMax) { setError('Min booking duration cannot exceed max.'); return; }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        name: formName.trim(),
        ...(formType.trim() && { resource_type: formType.trim() }),
        slot_interval_minutes: formSlot,
        min_booking_minutes: formMin,
        max_booking_minutes: formMax,
        ...(formPrice !== '' && { price_per_slot_pence: Math.round(parseFloat(formPrice) * 100) }),
        is_active: formActive,
        availability_hours: weekHoursToJSON(formHours),
        availability_exceptions: formExceptions,
      };
      const res = editingId
        ? await fetch('/api/venue/resources', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: editingId, ...payload }),
          })
        : await fetch('/api/venue/resources', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
      const json = await res.json();
      if (!res.ok) { setError((json as { error?: string }).error ?? 'Save failed'); return; }
      const savedId = (json as { id?: string }).id ?? editingId;
      setShowForm(false);
      await fetchResources();
      if (savedId) setSelectedId(savedId);
    } catch {
      setError('Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    const r = resources.find((x) => x.id === id);
    if (!window.confirm(`Delete "${r?.name ?? 'this resource'}"? Existing bookings are not affected.`)) return;
    try {
      const res = await fetch('/api/venue/resources', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) { const j = await res.json(); window.alert((j as { error?: string }).error ?? 'Delete failed'); return; }
      if (selectedId === id) setSelectedId(null);
      await fetchResources();
    } catch {
      window.alert('Delete failed');
    }
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-200 border-t-brand-600" />
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-col gap-6 lg:flex-row lg:items-start">
      {/* ─── Sidebar: resource list ─── */}
      <div className="w-full shrink-0 lg:w-72 xl:w-80">
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-900">Resources</h2>
            {isAdmin && (
              <button type="button" onClick={openCreate} className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-brand-700 transition-colors">
                + Add
              </button>
            )}
          </div>
          {resources.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <svg className="mx-auto h-10 w-10 text-slate-300" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
              </svg>
              <p className="mt-2 text-sm text-slate-500">No resources yet.</p>
              {isAdmin && (
                <button type="button" onClick={openCreate} className="mt-3 text-sm font-medium text-brand-600 hover:text-brand-800">
                  Create your first resource
                </button>
              )}
            </div>
          ) : (
            <ul className="divide-y divide-slate-50">
              {resources.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => { setSelectedId(r.id); setShowForm(false); }}
                    className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors ${
                      selectedId === r.id && !showForm ? 'bg-brand-50' : 'hover:bg-slate-50'
                    }`}
                  >
                    <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${r.is_active ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-slate-900">{r.name}</span>
                      <span className="block truncate text-xs text-slate-500">
                        {r.resource_type ?? 'Resource'}
                        {r.price_per_slot_pence != null && ` \u00b7 ${formatPrice(r.price_per_slot_pence)}/slot`}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* ─── Main panel ─── */}
      <div className="min-w-0 flex-1">
        {showForm ? (
          /* ── Create / Edit form ── */
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">{editingId ? 'Edit resource' : 'New resource'}</h2>

            {/* Basic info */}
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Name *</label>
                <input type="text" value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="e.g. Court 1" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Type</label>
                <input type="text" list="resource-type-suggestions" value={formType} onChange={(e) => setFormType(e.target.value)} placeholder="e.g. Tennis Court" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500" />
                <datalist id="resource-type-suggestions">
                  {RESOURCE_TYPE_SUGGESTIONS.map((s) => <option key={s} value={s} />)}
                </datalist>
              </div>
            </div>

            {/* Booking rules */}
            <h3 className="mt-6 text-sm font-semibold text-slate-800">Booking rules</h3>
            <div className="mt-2 grid gap-4 sm:grid-cols-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Slot interval</label>
                <select value={formSlot} onChange={(e) => setFormSlot(Number(e.target.value))} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500">
                  {SLOT_OPTIONS.map((m) => <option key={m} value={m}>{formatDuration(m)}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Min booking</label>
                <select value={formMin} onChange={(e) => setFormMin(Number(e.target.value))} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500">
                  {DURATION_OPTIONS.map((m) => <option key={m} value={m}>{formatDuration(m)}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Max booking</label>
                <select value={formMax} onChange={(e) => setFormMax(Number(e.target.value))} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500">
                  {DURATION_OPTIONS.map((m) => <option key={m} value={m}>{formatDuration(m)}</option>)}
                </select>
              </div>
            </div>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Price per slot ({sym})</label>
                <input type="number" min={0} step={0.01} value={formPrice} onChange={(e) => setFormPrice(e.target.value)} placeholder="Leave blank for free" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500" />
              </div>
              <div className="flex items-end pb-1">
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" checked={formActive} onChange={(e) => setFormActive(e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500" />
                  Active (bookable by guests)
                </label>
              </div>
            </div>

            {/* Weekly availability */}
            <h3 className="mt-6 text-sm font-semibold text-slate-800">Weekly availability</h3>
            <div className="mt-2 space-y-2">
              {DAY_LABELS.map((d) => {
                const day = formHours[d.key]!;
                return (
                  <div key={d.key} className="flex items-center gap-3 rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2">
                    <label className="flex w-24 shrink-0 items-center gap-2 text-sm">
                      <input type="checkbox" checked={day.enabled} onChange={(e) => setFormHours((h) => ({ ...h, [d.key]: { ...h[d.key]!, enabled: e.target.checked } }))} className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500" />
                      {d.label.slice(0, 3)}
                    </label>
                    {day.enabled && (
                      <div className="flex items-center gap-1.5 text-sm">
                        <input type="time" value={day.start} onChange={(e) => setFormHours((h) => ({ ...h, [d.key]: { ...h[d.key]!, start: e.target.value } }))} className="rounded border border-slate-200 px-2 py-1 text-xs" />
                        <span className="text-slate-400">&ndash;</span>
                        <input type="time" value={day.end} onChange={(e) => setFormHours((h) => ({ ...h, [d.key]: { ...h[d.key]!, end: e.target.value } }))} className="rounded border border-slate-200 px-2 py-1 text-xs" />
                      </div>
                    )}
                    {!day.enabled && <span className="text-xs text-slate-400">Closed</span>}
                  </div>
                );
              })}
            </div>

            {/* Date exceptions */}
            <h3 className="mt-6 text-sm font-semibold text-slate-800">Date exceptions</h3>
            <p className="mt-1 text-xs text-slate-500">Override specific dates (holidays, special hours).</p>
            <div className="mt-2 flex flex-wrap items-end gap-2">
              <div>
                <label className="mb-1 block text-xs text-slate-600">Date</label>
                <input type="date" value={formExceptionDate} onChange={(e) => setFormExceptionDate(e.target.value)} className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm" />
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-600">Type</label>
                <select value={formExceptionType} onChange={(e) => setFormExceptionType(e.target.value as 'closed' | 'custom')} className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm">
                  <option value="closed">Closed</option>
                  <option value="custom">Custom hours</option>
                </select>
              </div>
              {formExceptionType === 'custom' && (
                <>
                  <div>
                    <label className="mb-1 block text-xs text-slate-600">From</label>
                    <input type="time" value={formExceptionStart} onChange={(e) => setFormExceptionStart(e.target.value)} className="rounded border border-slate-200 px-2 py-1.5 text-sm" />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-slate-600">To</label>
                    <input type="time" value={formExceptionEnd} onChange={(e) => setFormExceptionEnd(e.target.value)} className="rounded border border-slate-200 px-2 py-1.5 text-sm" />
                  </div>
                </>
              )}
              <button type="button" onClick={addException} disabled={!formExceptionDate} className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-900 disabled:opacity-50">
                Add
              </button>
            </div>
            {Object.keys(formExceptions).length > 0 && (
              <ul className="mt-2 space-y-1">
                {Object.entries(formExceptions)
                  .sort(([a], [b]) => a.localeCompare(b))
                  .map(([dateKey, val]) => (
                    <li key={dateKey} className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-1.5 text-sm">
                      <span>
                        <span className="font-medium text-slate-800">{dateKey}</span>
                        <span className="ml-2 text-slate-500">
                          {'closed' in val ? 'Closed' : `${val.periods[0].start} \u2013 ${val.periods[0].end}`}
                        </span>
                      </span>
                      <button type="button" onClick={() => removeException(dateKey)} className="text-xs text-red-500 hover:text-red-700">Remove</button>
                    </li>
                  ))}
              </ul>
            )}

            {error && <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

            <div className="mt-6 flex gap-2">
              <button type="button" onClick={() => void handleSave()} disabled={saving} className="rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 disabled:opacity-50 transition-colors">
                {saving ? 'Saving\u2026' : editingId ? 'Save changes' : 'Create resource'}
              </button>
              <button type="button" onClick={() => setShowForm(false)} className="rounded-lg border border-slate-200 px-5 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors">
                Cancel
              </button>
            </div>
          </div>
        ) : selected ? (
          /* ── Selected resource detail ── */
          <div className="space-y-4">
            {/* Header */}
            <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-semibold text-slate-900">{selected.name}</h2>
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${selected.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                    {selected.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>
                {selected.resource_type && <p className="mt-0.5 text-sm text-slate-500">{selected.resource_type}</p>}
              </div>
              {isAdmin && (
                <div className="flex gap-2">
                  <button type="button" onClick={() => openEdit(selected)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors">
                    Edit
                  </button>
                  <button type="button" onClick={() => void handleDelete(selected.id)} className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 transition-colors">
                    Delete
                  </button>
                </div>
              )}
            </div>

            {/* Info cards */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <InfoCard label="Slot interval" value={formatDuration(selected.slot_interval_minutes)} />
              <InfoCard label="Min booking" value={formatDuration(selected.min_booking_minutes)} />
              <InfoCard label="Max booking" value={formatDuration(selected.max_booking_minutes)} />
              <InfoCard label="Price / slot" value={selected.price_per_slot_pence != null ? formatPrice(selected.price_per_slot_pence) : 'Free'} />
            </div>

            {/* Availability */}
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="text-sm font-semibold text-slate-900">Weekly availability</h3>
              <div className="mt-3 space-y-1.5">
                {DAY_LABELS.map((d) => {
                  const ranges = selected.availability_hours?.[d.key];
                  const open = ranges && ranges.length > 0;
                  return (
                    <div key={d.key} className="flex items-center gap-3 text-sm">
                      <span className="w-20 text-slate-600">{d.label.slice(0, 3)}</span>
                      {open ? (
                        <span className="text-slate-900">{ranges![0].start} &ndash; {ranges![0].end}</span>
                      ) : (
                        <span className="text-slate-400">Closed</span>
                      )}
                    </div>
                  );
                })}
              </div>
              {selected.availability_exceptions && Object.keys(selected.availability_exceptions).length > 0 && (
                <>
                  <h4 className="mt-4 text-xs font-semibold text-slate-700">Date exceptions</h4>
                  <ul className="mt-1.5 space-y-1 text-sm">
                    {Object.entries(selected.availability_exceptions)
                      .sort(([a], [b]) => a.localeCompare(b))
                      .map(([dateKey, val]) => (
                        <li key={dateKey} className="text-slate-600">
                          <span className="font-medium">{dateKey}:</span>{' '}
                          {'closed' in val ? 'Closed' : `${val.periods[0].start} \u2013 ${val.periods[0].end}`}
                        </li>
                      ))}
                  </ul>
                </>
              )}
            </div>

            {/* Bookings list */}
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-slate-900">Bookings</h3>
                <div className="flex items-center gap-1.5">
                  <button type="button" onClick={() => setBookingsDate((d) => { const t = new Date(`${d}T12:00:00`); t.setDate(t.getDate() - 1); return t.toISOString().slice(0, 10); })} className="rounded border border-slate-200 px-2 py-1 text-xs hover:bg-slate-50">&larr;</button>
                  <input type="date" value={bookingsDate} onChange={(e) => setBookingsDate(e.target.value)} className="rounded border border-slate-200 px-2 py-1 text-xs" />
                  <button type="button" onClick={() => setBookingsDate((d) => { const t = new Date(`${d}T12:00:00`); t.setDate(t.getDate() + 1); return t.toISOString().slice(0, 10); })} className="rounded border border-slate-200 px-2 py-1 text-xs hover:bg-slate-50">&rarr;</button>
                  <button type="button" onClick={() => setBookingsDate(new Date().toISOString().slice(0, 10))} className="rounded border border-slate-200 px-2 py-1 text-xs font-medium hover:bg-slate-50">Today</button>
                </div>
              </div>
              {bookingsLoading ? (
                <div className="mt-4 h-8 animate-pulse rounded bg-slate-100" />
              ) : bookings.length === 0 ? (
                <p className="mt-4 text-center text-sm text-slate-400">No bookings on this date.</p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {bookings.map((b) => (
                    <li key={b.id} className={`flex items-center justify-between rounded-lg border px-3 py-2 ${STATUS_COLOURS[b.status] ?? 'bg-white text-slate-900 border-slate-200'}`}>
                      <div className="min-w-0">
                        <span className="text-sm font-medium">{b.guest_name}</span>
                        <span className="ml-2 text-xs opacity-75">
                          {b.booking_time}{b.booking_end_time ? ` \u2013 ${b.booking_end_time}` : ''}
                        </span>
                      </div>
                      <span className="shrink-0 text-xs font-medium">{b.status}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ) : (
          /* ── Empty state ── */
          <div className="flex min-h-[30vh] items-center justify-center rounded-xl border border-dashed border-slate-200 bg-white">
            <div className="text-center">
              <p className="text-sm text-slate-500">
                {resources.length > 0 ? 'Select a resource from the list.' : 'Create a resource to get started.'}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-0.5 text-sm font-semibold text-slate-900">{value}</p>
    </div>
  );
}
