'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ResourceExceptionsCalendar } from './ResourceExceptionsCalendar';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ResourcePaymentRequirement = 'none' | 'deposit' | 'full_payment';

interface Resource {
  id: string;
  name: string;
  resource_type: string | null;
  /** Host unified calendar column (non-resource) where this resource appears on the staff calendar. */
  display_on_calendar_id: string | null;
  slot_interval_minutes: number;
  min_booking_minutes: number;
  max_booking_minutes: number;
  price_per_slot_pence: number | null;
  payment_requirement: ResourcePaymentRequirement;
  deposit_amount_pence: number | null;
  is_active: boolean;
  availability_hours: Record<string, Array<{ start: string; end: string }>> | null;
  availability_exceptions?: Record<string, { closed: true } | { periods: Array<{ start: string; end: string }> }> | null;
  sort_order: number;
  max_advance_booking_days?: number;
  min_booking_notice_hours?: number;
  cancellation_notice_hours?: number;
  allow_same_day_booking?: boolean;
}

interface ResourceBooking {
  id: string;
  booking_date: string;
  booking_time: string;
  booking_end_time: string | null;
  status: string;
  guest_name: string;
  party_size: number;
  deposit_amount_pence: number | null;
  deposit_status: string | null;
  resource_payment_requirement: ResourcePaymentRequirement | null;
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

const RESOURCE_TYPE_SUGGESTIONS = ['Tennis Court', 'Meeting Room', 'Studio', 'Pitch', 'Equipment', 'Desk', 'Bay', 'Lane', 'Pod'];

/** Aligned with GET/POST/PATCH /api/venue/resources zod schema */
const SLOT_INTERVAL_MIN = 5;
const SLOT_INTERVAL_MAX = 480;
const MIN_BOOKING_MIN = 15;
const MIN_BOOKING_MAX = 480;
const MAX_BOOKING_MIN = 15;
const MAX_BOOKING_MAX = 1440;

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

/** Local calendar YYYY-MM-DD (avoids UTC shift from toISOString). */
function formatYmdLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Inclusive list of dates from start to end (YYYY-MM-DD). Empty if invalid or end before start. */
function eachDateInRangeInclusive(start: string, end: string): string[] {
  const p = (s: string) => {
    const [y, mo, da] = s.split('-').map(Number);
    return { y, mo, da, d: new Date(y, mo - 1, da) };
  };
  const a = p(start);
  const b = p(end);
  if (!a.y || !b.y || Number.isNaN(a.d.getTime()) || Number.isNaN(b.d.getTime())) return [];
  if (b.d < a.d) return [];
  const out: string[] = [];
  for (let cur = new Date(a.d); cur <= b.d; cur.setDate(cur.getDate() + 1)) {
    out.push(formatYmdLocal(cur));
  }
  return out;
}

const MAX_EXCEPTION_RANGE_DAYS = 366;

function resourcePaymentSummary(r: Resource, formatPrice: (pence: number) => string): string {
  if (r.payment_requirement === 'none') return 'Pay at venue';
  if (r.payment_requirement === 'full_payment') return 'Full payment online';
  const dep = r.deposit_amount_pence != null ? formatPrice(r.deposit_amount_pence) : '—';
  return `Deposit ${dep} online`;
}

function resourceBookingPaymentLine(b: ResourceBooking, formatPrice: (pence: number) => string): string | null {
  const mode = b.resource_payment_requirement;
  const pence = b.deposit_amount_pence;
  const st = b.deposit_status ?? '-';
  if (mode === 'none') return 'Pay at venue';
  if (pence != null && pence > 0) {
    if (mode === 'full_payment') return `Paid ${formatPrice(pence)} online (${st})`;
    if (mode === 'deposit') return `Deposit ${formatPrice(pence)} (${st})`;
    return `Payment ${formatPrice(pence)} (${st})`;
  }
  if (mode === 'full_payment' || mode === 'deposit') return `Online payment ${st}`;
  return null;
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function ResourceTimelineView({
  venueId: _venueId,
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
  /** Shown after save when API reports host calendar hours narrower than resource weekly hours. */
  const [availabilityWarning, setAvailabilityWarning] = useState<string | null>(null);

  // Form state
  const [formName, setFormName] = useState('');
  const [formType, setFormType] = useState('');
  const [formSlotStr, setFormSlotStr] = useState('60');
  const [formMinStr, setFormMinStr] = useState('60');
  const [formMaxStr, setFormMaxStr] = useState('480');
  const [formPrice, setFormPrice] = useState('');
  const [formPaymentReq, setFormPaymentReq] = useState<ResourcePaymentRequirement>('none');
  const [formDeposit, setFormDeposit] = useState('');
  const [formActive, setFormActive] = useState(true);
  const [formHours, setFormHours] = useState<WeekHours>(defaultWeekHours);
  const [formExceptions, setFormExceptions] = useState<Record<string, { closed: true } | { periods: Array<{ start: string; end: string }> }>>({});
  const [exceptionMonth, setExceptionMonth] = useState(() => {
    const n = new Date();
    return { year: n.getFullYear(), month: n.getMonth() + 1 };
  });
  const [exceptionRangeStart, setExceptionRangeStart] = useState<string | null>(null);
  const [exceptionRangeEnd, setExceptionRangeEnd] = useState<string | null>(null);
  const [exceptionEditingDay, setExceptionEditingDay] = useState<string | null>(null);
  const [formExceptionType, setFormExceptionType] = useState<'closed' | 'custom'>('closed');
  const [formExceptionStart, setFormExceptionStart] = useState('09:00');
  const [formExceptionEnd, setFormExceptionEnd] = useState('17:00');
  const [formDisplayCalendarId, setFormDisplayCalendarId] = useState('');
  const [formMaxAdvanceDays, setFormMaxAdvanceDays] = useState(90);
  const [formMinNoticeHours, setFormMinNoticeHours] = useState(1);
  const [formCancellationHours, setFormCancellationHours] = useState(48);
  const [formAllowSameDay, setFormAllowSameDay] = useState(true);
  const [hostCalendars, setHostCalendars] = useState<Array<{ id: string; name: string }>>([]);
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

  const fetchHostCalendars = useCallback(async () => {
    try {
      const res = await fetch('/api/venue/practitioners?roster=1');
      if (!res.ok) return;
      const data = await res.json();
      const list = (data.practitioners ?? []).filter(
        (p: { calendar_type?: string }) => p.calendar_type !== 'resource',
      ) as Array<{ id: string; name: string }>;
      setHostCalendars(list.map((p) => ({ id: p.id, name: p.name })));
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void fetchHostCalendars();
  }, [fetchHostCalendars]);

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
              deposit_amount_pence: (b.deposit_amount_pence as number | null) ?? null,
              deposit_status: (b.deposit_status as string | null) ?? null,
              resource_payment_requirement: (b.resource_payment_requirement as ResourcePaymentRequirement | null) ?? null,
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
    setFormSlotStr('60');
    setFormMinStr('60');
    setFormMaxStr('480');
    setFormPrice('');
    setFormPaymentReq('none');
    setFormDeposit('');
    setFormActive(true);
    setFormHours(defaultWeekHours());
    setFormExceptions({});
    const n = new Date();
    setExceptionMonth({ year: n.getFullYear(), month: n.getMonth() + 1 });
    setExceptionRangeStart(null);
    setExceptionRangeEnd(null);
    setExceptionEditingDay(null);
    setFormDisplayCalendarId('');
    setFormMaxAdvanceDays(90);
    setFormMinNoticeHours(1);
    setFormCancellationHours(48);
    setFormAllowSameDay(true);
    setError(null);
    setShowForm(true);
  }

  function openEdit(r: Resource) {
    setEditingId(r.id);
    setFormName(r.name);
    setFormType(r.resource_type ?? '');
    setFormSlotStr(String(r.slot_interval_minutes));
    setFormMinStr(String(r.min_booking_minutes));
    setFormMaxStr(String(r.max_booking_minutes));
    setFormPrice(r.price_per_slot_pence != null ? (r.price_per_slot_pence / 100).toFixed(2) : '');
    setFormPaymentReq(r.payment_requirement ?? 'none');
    setFormDeposit(r.deposit_amount_pence != null ? (r.deposit_amount_pence / 100).toFixed(2) : '');
    setFormActive(r.is_active);
    setFormHours(weekHoursFromJSON(r.availability_hours));
    setFormExceptions(r.availability_exceptions ? { ...r.availability_exceptions } : {});
    const n = new Date();
    setExceptionMonth({ year: n.getFullYear(), month: n.getMonth() + 1 });
    setExceptionRangeStart(null);
    setExceptionRangeEnd(null);
    setExceptionEditingDay(null);
    setFormDisplayCalendarId(r.display_on_calendar_id ?? '');
    setFormMaxAdvanceDays(r.max_advance_booking_days ?? 90);
    setFormMinNoticeHours(r.min_booking_notice_hours ?? 1);
    setFormCancellationHours(r.cancellation_notice_hours ?? 48);
    setFormAllowSameDay(r.allow_same_day_booking ?? true);
    setError(null);
    setShowForm(true);
  }

  function applyExceptionRange() {
    if (!exceptionRangeStart) {
      setError('Tap a day on the calendar to start a range, then tap another day (or use Apply for a single day).');
      return;
    }
    const end = exceptionRangeEnd ?? exceptionRangeStart;
    if (end < exceptionRangeStart) {
      setError('End date must be on or after the start date.');
      return;
    }
    const dates = eachDateInRangeInclusive(exceptionRangeStart, end);
    if (dates.length === 0) {
      setError('Invalid date range.');
      return;
    }
    if (dates.length > MAX_EXCEPTION_RANGE_DAYS) {
      setError(`Date range cannot exceed ${MAX_EXCEPTION_RANGE_DAYS} days.`);
      return;
    }
    const value =
      formExceptionType === 'closed'
        ? { closed: true as const }
        : { periods: [{ start: formExceptionStart, end: formExceptionEnd }] };
    setFormExceptions((prev) => {
      const next = { ...prev };
      for (const dateKey of dates) {
        next[dateKey] = value;
      }
      return next;
    });
    setExceptionRangeStart(null);
    setExceptionRangeEnd(null);
    setError(null);
  }

  function handleExceptionDayClick(ymd: string) {
    setError(null);
    const ex = formExceptions[ymd];
    if (ex) {
      setExceptionEditingDay(ymd);
      setExceptionRangeStart(null);
      setExceptionRangeEnd(null);
      if ('closed' in ex) {
        setFormExceptionType('closed');
      } else {
        setFormExceptionType('custom');
        setFormExceptionStart(ex.periods[0]?.start ?? '09:00');
        setFormExceptionEnd(ex.periods[0]?.end ?? '17:00');
      }
      return;
    }
    setExceptionEditingDay(null);
    if (!exceptionRangeStart) {
      setExceptionRangeStart(ymd);
      setExceptionRangeEnd(null);
      return;
    }
    if (!exceptionRangeEnd) {
      const [a, b] = ymd < exceptionRangeStart ? [ymd, exceptionRangeStart] : [exceptionRangeStart, ymd];
      setExceptionRangeStart(a);
      setExceptionRangeEnd(b);
      return;
    }
    setExceptionRangeStart(ymd);
    setExceptionRangeEnd(null);
  }

  function clearExceptionRangeSelection() {
    setExceptionRangeStart(null);
    setExceptionRangeEnd(null);
  }

  function saveExceptionEdit() {
    if (!exceptionEditingDay) return;
    const value =
      formExceptionType === 'closed'
        ? { closed: true as const }
        : { periods: [{ start: formExceptionStart, end: formExceptionEnd }] };
    setFormExceptions((prev) => ({ ...prev, [exceptionEditingDay]: value }));
    setExceptionEditingDay(null);
    setError(null);
  }

  function cancelExceptionEdit() {
    setExceptionEditingDay(null);
  }

  function exceptionPrevMonth() {
    setExceptionMonth((m) => (m.month <= 1 ? { year: m.year - 1, month: 12 } : { year: m.year, month: m.month - 1 }));
  }

  function exceptionNextMonth() {
    setExceptionMonth((m) => (m.month >= 12 ? { year: m.year + 1, month: 1 } : { year: m.year, month: m.month + 1 }));
  }

  function removeException(dateKey: string) {
    setFormExceptions((prev) => {
      const next = { ...prev };
      delete next[dateKey];
      return next;
    });
    if (exceptionEditingDay === dateKey) setExceptionEditingDay(null);
  }

  async function handleSave() {
    if (!formName.trim()) { setError('Resource name is required.'); return; }

    const formSlot = parseInt(formSlotStr.trim(), 10);
    const formMin = parseInt(formMinStr.trim(), 10);
    const formMax = parseInt(formMaxStr.trim(), 10);
    if (!Number.isFinite(formSlot) || formSlot < SLOT_INTERVAL_MIN || formSlot > SLOT_INTERVAL_MAX) {
      setError(`Slot interval must be a whole number from ${SLOT_INTERVAL_MIN} to ${SLOT_INTERVAL_MAX} minutes.`);
      return;
    }
    if (!Number.isFinite(formMin) || formMin < MIN_BOOKING_MIN || formMin > MIN_BOOKING_MAX) {
      setError(`Min booking must be a whole number from ${MIN_BOOKING_MIN} to ${MIN_BOOKING_MAX} minutes.`);
      return;
    }
    if (!Number.isFinite(formMax) || formMax < MAX_BOOKING_MIN || formMax > MAX_BOOKING_MAX) {
      setError(`Max booking must be a whole number from ${MAX_BOOKING_MIN} to ${MAX_BOOKING_MAX} minutes.`);
      return;
    }
    if (formMin > formMax) { setError('Min booking duration cannot exceed max.'); return; }

    const pricePence = formPrice !== '' ? Math.round(parseFloat(formPrice) * 100) : 0;
    if ((formPaymentReq === 'deposit' || formPaymentReq === 'full_payment') && pricePence <= 0) {
      setError('Set a price per slot before choosing deposit or full payment online.');
      return;
    }
    if (formPaymentReq === 'deposit') {
      const d = parseFloat(formDeposit);
      if (!Number.isFinite(d) || d <= 0) { setError('Enter a deposit amount greater than zero.'); return; }
      const depPence = Math.round(d * 100);
      const maxSlots = Math.max(1, Math.ceil(formMax / formSlot));
      const maxTotal = pricePence * maxSlots;
      if (pricePence > 0 && depPence > maxTotal) {
        setError('Deposit cannot exceed the maximum possible booking total for this resource.');
        return;
      }
    }
    if (!formDisplayCalendarId) {
      setError('Choose a calendar column to show this resource on.');
      return;
    }
    setSaving(true);
    setError(null);
    setAvailabilityWarning(null);
    try {
      const payload = {
        name: formName.trim(),
        ...(formType.trim() && { resource_type: formType.trim() }),
        display_on_calendar_id: formDisplayCalendarId,
        slot_interval_minutes: formSlot,
        min_booking_minutes: formMin,
        max_booking_minutes: formMax,
        ...(formPrice !== '' && { price_per_slot_pence: pricePence }),
        payment_requirement: formPaymentReq,
        ...(formPaymentReq === 'deposit'
          ? { deposit_amount_pence: Math.round(parseFloat(formDeposit) * 100) }
          : { deposit_amount_pence: null }),
        is_active: formActive,
        availability_hours: weekHoursToJSON(formHours),
        availability_exceptions: formExceptions,
        max_advance_booking_days: formMaxAdvanceDays,
        min_booking_notice_hours: formMinNoticeHours,
        cancellation_notice_hours: formCancellationHours,
        allow_same_day_booking: formAllowSameDay,
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
      if (!res.ok) {
        const j = json as { error?: string; details?: string };
        const msg = [j.error, j.details].filter(Boolean).join(' — ');
        setError(msg || 'Save failed');
        return;
      }
      const j = json as { id?: string; availability_warning?: string };
      if (j.availability_warning) {
        setAvailabilityWarning(j.availability_warning);
      }
      const savedId = j.id ?? editingId;
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
                        {hostCalendars.find((c) => c.id === r.display_on_calendar_id)?.name ?? 'Calendar'}
                        {r.resource_type ? ` · ${r.resource_type}` : ''}
                        {r.price_per_slot_pence != null && ` · ${formatPrice(r.price_per_slot_pence)}/slot`}
                        {` · ${resourcePaymentSummary(r, formatPrice)}`}
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
        {availabilityWarning && (
          <div
            className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 shadow-sm"
            role="status"
          >
            <p className="font-medium text-amber-900">Calendar availability notice</p>
            <p className="mt-1 text-amber-900/95">{availabilityWarning}</p>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <Link
                href="/dashboard/calendar-availability?tab=availability"
                className="inline-flex items-center rounded-lg bg-amber-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-900"
              >
                Open Calendar availability
              </Link>
              <button
                type="button"
                onClick={() => setAvailabilityWarning(null)}
                className="text-xs font-medium text-amber-800 underline underline-offset-2 hover:text-amber-950"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}
        {showForm ? (
          /* ── Create / Edit form ── */
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">{editingId ? 'Edit resource' : 'New resource'}</h2>

            {/* Basic info */}
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Name *</label>
                <input type="text" value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="e.g. Room 1, Studio A" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Type</label>
                <input
                  type="text"
                  value={formType}
                  onChange={(e) => setFormType(e.target.value)}
                  placeholder="Short label (e.g. meeting room, equipment bay)"
                  autoComplete="off"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                />
                <p className="mt-1 text-[11px] text-slate-500">Optional. Quick picks (tap to fill — you can still edit the text):</p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {RESOURCE_TYPE_SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setFormType(s)}
                      className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-100"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-4 max-w-xl">
              <label className="mb-1 block text-xs font-medium text-slate-600">Show on calendar *</label>
              <select
                value={formDisplayCalendarId}
                onChange={(e) => setFormDisplayCalendarId(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
              >
                <option value="">Select a calendar column</option>
                {hostCalendars.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              {isAdmin && (
                <div className="mt-3 rounded-lg border border-slate-100 bg-slate-50/90 p-3">
                  <Link
                    href="/dashboard/calendar-availability?tab=calendars&addCalendar=1"
                    className="inline-flex w-full items-center justify-center rounded-lg border border-brand-200/90 bg-white px-3.5 py-2.5 text-sm font-semibold text-brand-700 shadow-sm transition-[color,background-color,border-color,box-shadow,transform] duration-150 ease-out hover:border-brand-400 hover:bg-brand-50 hover:text-brand-800 hover:shadow-md active:scale-[0.98] active:border-brand-500 active:bg-brand-100 active:shadow-inner motion-reduce:transition-colors motion-reduce:active:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
                  >
                    Add calendar
                  </Link>
                  <p className="mt-2 text-xs text-slate-500">
                    Opens the same Add calendar form as the Calendars tab. When you are done, return here and refresh
                    if your new column does not appear in the list yet.
                  </p>
                </div>
              )}
              <p className="mt-1 text-xs text-slate-500">
                Resource bookings and free slots appear on that calendar. Two resources can use the same calendar only if
                their weekly hours do not overlap (e.g. 9–1 vs 3–6).
              </p>
            </div>

            {/* Booking rules */}
            <h3 className="mt-6 text-sm font-semibold text-slate-800">Booking rules</h3>
            <div className="mt-2 grid gap-4 sm:grid-cols-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Slot interval (minutes)</label>
                <input
                  type="number"
                  min={SLOT_INTERVAL_MIN}
                  max={SLOT_INTERVAL_MAX}
                  step={1}
                  inputMode="numeric"
                  value={formSlotStr}
                  onChange={(e) => setFormSlotStr(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                />
                <p className="mt-1 text-[11px] text-slate-500">
                  Grid step for start times ({SLOT_INTERVAL_MIN}–{SLOT_INTERVAL_MAX} min).
                </p>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Min booking (minutes)</label>
                <input
                  type="number"
                  min={MIN_BOOKING_MIN}
                  max={MIN_BOOKING_MAX}
                  step={1}
                  inputMode="numeric"
                  value={formMinStr}
                  onChange={(e) => setFormMinStr(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                />
                <p className="mt-1 text-[11px] text-slate-500">
                  Shortest bookable length ({MIN_BOOKING_MIN}–{MIN_BOOKING_MAX} min).
                </p>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Max booking (minutes)</label>
                <input
                  type="number"
                  min={MAX_BOOKING_MIN}
                  max={MAX_BOOKING_MAX}
                  step={1}
                  inputMode="numeric"
                  value={formMaxStr}
                  onChange={(e) => setFormMaxStr(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                />
                <p className="mt-1 text-[11px] text-slate-500">
                  Longest bookable length ({MAX_BOOKING_MIN}–{MAX_BOOKING_MAX} min).
                </p>
              </div>
            </div>
            <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50/80 p-3">
              <p className="mb-2 text-xs font-medium text-slate-700">Guest online booking</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">Max advance (days)</label>
                  <input
                    type="number"
                    min={1}
                    max={365}
                    value={formMaxAdvanceDays}
                    onChange={(e) => setFormMaxAdvanceDays(parseInt(e.target.value, 10) || 1)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">Min notice (hours)</label>
                  <input
                    type="number"
                    min={0}
                    max={168}
                    value={formMinNoticeHours}
                    onChange={(e) => setFormMinNoticeHours(parseInt(e.target.value, 10) || 0)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">Cancellation notice (hours)</label>
                  <input
                    type="number"
                    min={0}
                    max={168}
                    value={formCancellationHours}
                    onChange={(e) => setFormCancellationHours(parseInt(e.target.value, 10) || 0)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  />
                </div>
                <div className="flex items-end pb-1">
                  <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={formAllowSameDay}
                      onChange={(e) => setFormAllowSameDay(e.target.checked)}
                      className="h-4 w-4 rounded border-slate-300"
                    />
                    Allow same-day bookings
                  </label>
                </div>
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
            <div className="mt-4">
              <p className="mb-2 text-xs font-medium text-slate-600">Guest payment</p>
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                {(
                  [
                    { v: 'none' as const, label: 'Pay at venue' },
                    { v: 'deposit' as const, label: 'Deposit online' },
                    { v: 'full_payment' as const, label: 'Pay in full online' },
                  ] as const
                ).map((opt) => (
                  <label
                    key={opt.v}
                    className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                      formPaymentReq === opt.v ? 'border-brand-500 bg-brand-50 text-slate-900' : 'border-slate-200 text-slate-700'
                    }`}
                  >
                    <input
                      type="radio"
                      name="resource-payment-req"
                      checked={formPaymentReq === opt.v}
                      onChange={() => setFormPaymentReq(opt.v)}
                      className="h-4 w-4 border-slate-300 text-brand-600 focus:ring-brand-500"
                    />
                    {opt.label}
                  </label>
                ))}
              </div>
              {formPaymentReq === 'deposit' && (
                <div className="mt-3 max-w-xs">
                  <label className="mb-1 block text-xs font-medium text-slate-600">Deposit amount ({sym})</label>
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={formDeposit}
                    onChange={(e) => setFormDeposit(e.target.value)}
                    placeholder="e.g. 10.00"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                  />
                  <p className="mt-1 text-xs text-slate-500">Charged when the guest books (Stripe). Balance due at venue if applicable.</p>
                </div>
              )}
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
            <p className="mt-1 text-xs text-slate-500">
              Override holidays or special hours. Choose closed or amended hours below, then tap the calendar: first day starts a range, second day completes it (or tap &quot;Apply&quot; after one day for a single date). Tap a day that already has an amendment to edit or remove it.
            </p>

            {exceptionEditingDay ? (
              <div className="mt-4 rounded-xl border border-slate-300 bg-slate-50 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Editing</p>
                    <p className="text-sm font-medium text-slate-900">{exceptionEditingDay}</p>
                  </div>
                  <button
                    type="button"
                    onClick={cancelExceptionEdit}
                    className="text-xs font-medium text-slate-600 hover:text-slate-900"
                  >
                    Close
                  </button>
                </div>
                <div className="mt-3 flex flex-wrap items-end gap-2">
                  <div>
                    <label className="mb-1 block text-xs text-slate-600">Closure or amended hours</label>
                    <select
                      value={formExceptionType}
                      onChange={(e) => setFormExceptionType(e.target.value as 'closed' | 'custom')}
                      className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm"
                    >
                      <option value="closed">Closed (not open)</option>
                      <option value="custom">Amended hours (custom times)</option>
                    </select>
                  </div>
                  {formExceptionType === 'custom' && (
                    <>
                      <div>
                        <label className="mb-1 block text-xs text-slate-600">From</label>
                        <input
                          type="time"
                          value={formExceptionStart}
                          onChange={(e) => setFormExceptionStart(e.target.value)}
                          className="rounded border border-slate-200 bg-white px-2 py-1.5 text-sm"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs text-slate-600">To</label>
                        <input
                          type="time"
                          value={formExceptionEnd}
                          onChange={(e) => setFormExceptionEnd(e.target.value)}
                          className="rounded border border-slate-200 bg-white px-2 py-1.5 text-sm"
                        />
                      </div>
                    </>
                  )}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={saveExceptionEdit}
                    className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700"
                  >
                    Save changes
                  </button>
                  <button
                    type="button"
                    onClick={() => removeException(exceptionEditingDay)}
                    className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
                  >
                    Remove this day
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/80 p-4">
                <p className="text-xs font-semibold text-slate-700">Add closure or amended hours</p>
                <div className="mt-2 flex flex-wrap items-end gap-2">
                  <div>
                    <label className="mb-1 block text-xs text-slate-600">Closure or amended hours</label>
                    <select
                      value={formExceptionType}
                      onChange={(e) => setFormExceptionType(e.target.value as 'closed' | 'custom')}
                      className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm"
                    >
                      <option value="closed">Closed (not open)</option>
                      <option value="custom">Amended hours (custom times)</option>
                    </select>
                  </div>
                  {formExceptionType === 'custom' && (
                    <>
                      <div>
                        <label className="mb-1 block text-xs text-slate-600">From</label>
                        <input
                          type="time"
                          value={formExceptionStart}
                          onChange={(e) => setFormExceptionStart(e.target.value)}
                          className="rounded border border-slate-200 bg-white px-2 py-1.5 text-sm"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs text-slate-600">To</label>
                        <input
                          type="time"
                          value={formExceptionEnd}
                          onChange={(e) => setFormExceptionEnd(e.target.value)}
                          className="rounded border border-slate-200 bg-white px-2 py-1.5 text-sm"
                        />
                      </div>
                    </>
                  )}
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={applyExceptionRange}
                    disabled={!exceptionRangeStart}
                    className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-900 disabled:opacity-50"
                  >
                    Apply to calendar selection
                  </button>
                  <button
                    type="button"
                    onClick={clearExceptionRangeSelection}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Clear selection
                  </button>
                  {exceptionRangeStart && (
                    <span className="text-xs text-slate-500">
                      {exceptionRangeEnd
                        ? `${exceptionRangeStart} → ${exceptionRangeEnd}`
                        : `${exceptionRangeStart} (single day — tap Apply)`}
                    </span>
                  )}
                </div>
              </div>
            )}

            <div className="mt-4 max-w-2xl">
              <ResourceExceptionsCalendar
                year={exceptionMonth.year}
                month={exceptionMonth.month}
                onPrevMonth={exceptionPrevMonth}
                onNextMonth={exceptionNextMonth}
                exceptions={formExceptions}
                rangeStart={exceptionRangeStart}
                rangeEnd={exceptionRangeEnd}
                editingDay={exceptionEditingDay}
                onDayClick={handleExceptionDayClick}
              />
            </div>

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
              <InfoCard label="Guest payment" value={resourcePaymentSummary(selected, formatPrice)} />
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
                  {bookings.map((b) => {
                    const payLine = resourceBookingPaymentLine(b, formatPrice);
                    return (
                    <li key={b.id} className={`flex flex-col gap-1 rounded-lg border px-3 py-2 sm:flex-row sm:items-center sm:justify-between ${STATUS_COLOURS[b.status] ?? 'bg-white text-slate-900 border-slate-200'}`}>
                      <div className="min-w-0">
                        <span className="text-sm font-medium">{b.guest_name}</span>
                        <span className="ml-2 text-xs opacity-75">
                          {b.booking_time}{b.booking_end_time ? ` \u2013 ${b.booking_end_time}` : ''}
                        </span>
                        {payLine ? <div className="mt-0.5 text-[11px] opacity-90">{payLine}</div> : null}
                      </div>
                      <span className="shrink-0 text-xs font-medium">{b.status}</span>
                    </li>
                    );
                  })}
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
