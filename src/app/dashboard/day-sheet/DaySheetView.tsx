'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/browser';
import { parseDietaryNotes, hasAllergyKeywords } from '@/lib/day-sheet';
import { useToast } from '@/components/ui/Toast';
import { BOOKING_STATUS_TRANSITIONS, type BookingStatus } from '@/lib/table-management/booking-status';

// ─── Types ──────────────────────────────────────────────────────────────────

interface DaySheetBooking {
  id: string;
  booking_time: string;
  estimated_end_time: string | null;
  party_size: number;
  status: string;
  source: string;
  deposit_status: string;
  deposit_amount_pence: number | null;
  dietary_notes: string | null;
  special_requests: string | null;
  internal_notes: string | null;
  occasion: string | null;
  guest_name: string;
  guest_phone: string | null;
  guest_email: string | null;
  guest_id: string;
  visit_count: number;
  no_show_count: number;
  last_visit_date: string | null;
  created_at: string;
}

interface DaySheetPeriod {
  key: string;
  label: string;
  start_time: string;
  end_time: string;
  max_covers: number | null;
  booked_covers: number;
  bookings: DaySheetBooking[];
}

interface DaySheetData {
  date: string;
  venue_name: string;
  periods: DaySheetPeriod[];
  summary: {
    total_bookings: number;
    total_covers: number;
    covers_remaining: number | null;
    pending_count: number;
    seated_covers: number;
    completed_covers: number;
    no_show_covers: number;
    cancelled_covers: number;
    venue_max_capacity: number | null;
    covers_in_use: number;
    covers_available_now: number | null;
    freeing_soon: number;
    arriving_soon: number;
    is_today: boolean;
    default_duration_minutes: number;
  };
  dietary_summary: Array<{ label: string; count: number; isAllergy?: boolean }>;
  no_show_grace_minutes: number;
  capacity_configured: boolean;
}

interface BookingDetail {
  communications: Array<{ id: string; message_type: string; channel: string; status: string; created_at: string }>;
}

interface ConfirmState {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
}

type ConnectionStatus = 'green' | 'amber' | 'red';

interface Filters {
  periodKey: string;
  statuses: Set<string>;
  search: string;
  showCancelled: boolean;
  showNoShow: boolean;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const SHORT_WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const POLL_INTERVAL_MS = 30_000;

const STATUS_STYLE: Record<string, { dot: string; bg: string; text: string; ring: string }> = {
  Pending:   { dot: 'bg-amber-500',   bg: 'bg-amber-50',   text: 'text-amber-700',   ring: 'ring-amber-200' },
  Confirmed: { dot: 'bg-teal-500',    bg: 'bg-teal-50',    text: 'text-teal-700',    ring: 'ring-teal-200' },
  Seated:    { dot: 'bg-blue-600',    bg: 'bg-blue-50',    text: 'text-blue-700',    ring: 'ring-blue-200' },
  Completed: { dot: 'bg-slate-400',   bg: 'bg-slate-50',   text: 'text-slate-500',   ring: 'ring-slate-200' },
  'No-Show': { dot: 'bg-red-500',     bg: 'bg-red-50',     text: 'text-red-700',     ring: 'ring-red-200' },
  Cancelled: { dot: 'bg-slate-300',   bg: 'bg-slate-50',   text: 'text-slate-400',   ring: 'ring-slate-200' },
};

const PRIMARY_ACTIONS: Record<string, { label: string; target: BookingStatus }> = {
  Pending:   { label: 'Confirm', target: 'Confirmed' },
  Confirmed: { label: 'Seat',    target: 'Seated' },
  Seated:    { label: 'Complete', target: 'Completed' },
};

const DEFAULT_STATUSES = new Set(['Pending', 'Confirmed', 'Seated']);

// ─── Helpers ────────────────────────────────────────────────────────────────

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}
function addDays(date: string, days: number): string {
  const d = new Date(date + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
function formatDateFull(date: string): string {
  const d = new Date(date + 'T12:00:00');
  return `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}
function formatDateShort(date: string): string {
  const d = new Date(date + 'T12:00:00');
  return `${SHORT_WEEKDAYS[d.getDay()]} ${d.getDate()} ${SHORT_MONTHS[d.getMonth()]}`;
}
function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}
function minutesToTime(m: number): string {
  return `${Math.floor(m / 60).toString().padStart(2, '0')}:${(m % 60).toString().padStart(2, '0')}`;
}
function formatPence(pence: number): string {
  return `£${(pence / 100).toFixed(2)}`;
}
function canNoShow(bookingTime: string, bookingDate: string, graceMinutes: number): boolean {
  const today = todayISO();
  if (bookingDate < today) return true;
  if (bookingDate > today) return false;
  const [h, m] = bookingTime.split(':').map(Number);
  const bookingMin = (h ?? 0) * 60 + (m ?? 0);
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  return nowMin >= bookingMin + graceMinutes;
}
function isTerminal(status: string): boolean {
  return ['Completed', 'No-Show', 'Cancelled'].includes(status);
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]!);
}

// ─── FillBar ────────────────────────────────────────────────────────────────

function FillBar({ booked, capacity }: { booked: number; capacity: number }) {
  const pct = capacity > 0 ? Math.min(100, Math.round((booked / capacity) * 100)) : 0;
  const colour = pct >= 90 ? 'bg-red-500' : pct >= 75 ? 'bg-amber-500' : 'bg-emerald-500';
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-24 overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full rounded-full transition-all ${colour}`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`text-xs font-semibold tabular-nums ${pct >= 90 ? 'text-red-600' : pct >= 75 ? 'text-amber-600' : 'text-emerald-600'}`}>
        {pct}%
      </span>
    </div>
  );
}

// ─── SummaryBar ─────────────────────────────────────────────────────────────

function SummaryBar({
  summary,
  capacityConfigured,
}: {
  summary: DaySheetData['summary'];
  capacityConfigured: boolean;
}) {
  const isToday = summary.is_today;

  // Build the "freeing soon" display
  const netFreeing = summary.freeing_soon - summary.arriving_soon;
  let freeingLabel: string;
  let freeingValue: string;
  let freeingAccent: string;
  if (!isToday || !capacityConfigured) {
    freeingLabel = 'Pending';
    freeingValue = String(summary.pending_count);
    freeingAccent = summary.pending_count > 0 ? 'text-amber-700 border-amber-200' : 'text-slate-700 border-slate-200';
  } else if (netFreeing > 0) {
    freeingLabel = 'Freeing in 30 min';
    freeingValue = `+${netFreeing}`;
    freeingAccent = 'text-emerald-700 border-emerald-200';
  } else if (netFreeing < 0) {
    freeingLabel = 'Arriving in 30 min';
    freeingValue = String(Math.abs(netFreeing));
    freeingAccent = 'text-amber-700 border-amber-200';
  } else if (summary.freeing_soon > 0) {
    freeingLabel = 'Freeing in 30 min';
    freeingValue = `${summary.freeing_soon} (${summary.arriving_soon} arriving)`;
    freeingAccent = 'text-slate-700 border-slate-200';
  } else {
    freeingLabel = 'Freeing in 30 min';
    freeingValue = '0';
    freeingAccent = 'text-slate-700 border-slate-200';
  }

  const cards: Array<{ label: string; value: string | number; sub?: string; accent: string }> = isToday
    ? [
        {
          label: 'Covers In Use',
          value: summary.covers_in_use,
          sub: summary.venue_max_capacity != null ? `of ${summary.venue_max_capacity}` : undefined,
          accent: summary.covers_in_use > 0 ? 'text-blue-700 border-blue-200' : 'text-slate-700 border-slate-200',
        },
        {
          label: 'Available Now',
          value: summary.covers_available_now != null ? summary.covers_available_now : '—',
          accent: summary.covers_available_now != null
            ? summary.covers_available_now === 0 ? 'text-red-700 border-red-200'
              : summary.covers_available_now <= 5 ? 'text-amber-700 border-amber-200'
              : 'text-emerald-700 border-emerald-200'
            : 'text-slate-700 border-slate-200',
        },
        { label: 'Bookings', value: summary.total_bookings, accent: 'text-slate-700 border-slate-200' },
        { label: freeingLabel, value: freeingValue, accent: freeingAccent },
      ]
    : [
        { label: 'Total Covers', value: summary.total_covers, accent: 'text-brand-700 border-brand-200' },
        { label: 'Remaining', value: summary.covers_remaining != null ? summary.covers_remaining : '—', accent: 'text-emerald-700 border-emerald-200' },
        { label: 'Bookings', value: summary.total_bookings, accent: 'text-slate-700 border-slate-200' },
        { label: freeingLabel, value: freeingValue, accent: freeingAccent },
      ];

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 print:grid-cols-4">
      {cards.map((c) => (
        <div
          key={c.label}
          className={`rounded-xl border bg-white p-3 text-left shadow-sm ${c.accent}`}
        >
          <p className="text-[11px] font-medium text-slate-500">{c.label}</p>
          <p className="mt-0.5 text-xl font-bold tabular-nums">{c.value}</p>
          {c.sub && <p className="text-[10px] text-slate-400">{c.sub}</p>}
        </div>
      ))}
    </div>
  );
}

// ─── TimelineBreakdown ──────────────────────────────────────────────────────

function TimelineBreakdown({ periods, date }: { periods: DaySheetPeriod[]; date: string }) {
  const isToday = date === todayISO();
  const now = new Date();
  const currentMinutes = isToday ? now.getHours() * 60 + now.getMinutes() : -1;

  const allBookings = periods.flatMap((p) => p.bookings).filter((b) => !isTerminal(b.status));
  const totalCapacity = periods.reduce((s, p) => s + (p.max_covers ?? 0), 0);

  let earliest = 24 * 60;
  let latest = 0;
  for (const p of periods) {
    earliest = Math.min(earliest, timeToMinutes(p.start_time));
    latest = Math.max(latest, timeToMinutes(p.end_time));
  }
  if (earliest >= latest) { earliest = 8 * 60; latest = 23 * 60; }

  const slots: Array<{ time: string; minutes: number; arriving: number; inHouse: number }> = [];
  for (let m = earliest; m < latest; m += 30) {
    const timeLabel = minutesToTime(m);
    let arriving = 0;
    let inHouse = 0;
    for (const b of allBookings) {
      const bStart = timeToMinutes(b.booking_time);
      const bEnd = b.estimated_end_time ? timeToMinutes(b.estimated_end_time) : bStart + 90;
      if (bStart >= m && bStart < m + 30) arriving += b.party_size;
      if (bStart <= m && bEnd > m) inHouse += b.party_size;
    }
    slots.push({ time: timeLabel, minutes: m, arriving, inHouse });
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white print:hidden">
      <div className="flex min-w-max">
        {slots.map((slot) => {
          const isCurrent = isToday && currentMinutes >= slot.minutes && currentMinutes < slot.minutes + 30;
          const fillPct = totalCapacity > 0 ? Math.min(100, Math.round((slot.inHouse / totalCapacity) * 100)) : 0;
          return (
            <div
              key={slot.time}
              className={`flex w-16 flex-shrink-0 flex-col items-center border-r border-slate-50 px-1 py-2 text-center ${
                isCurrent ? 'bg-brand-50 ring-1 ring-inset ring-brand-300' : ''
              }`}
            >
              <span className={`text-[10px] font-semibold tabular-nums ${isCurrent ? 'text-brand-700' : 'text-slate-500'}`}>
                {slot.time}
              </span>
              <div className="mt-1 h-8 w-4 overflow-hidden rounded-sm bg-slate-100">
                <div
                  className={`w-full rounded-sm transition-all ${fillPct >= 90 ? 'bg-red-400' : fillPct >= 75 ? 'bg-amber-400' : 'bg-emerald-400'}`}
                  style={{ height: `${fillPct}%`, marginTop: `${100 - fillPct}%` }}
                />
              </div>
              <span className="mt-1 text-[10px] font-bold tabular-nums text-slate-700">{slot.inHouse}</span>
              {slot.arriving > 0 && (
                <span className="text-[9px] tabular-nums text-emerald-600">+{slot.arriving}</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── ConfirmDialog ──────────────────────────────────────────────────────────

function ConfirmDialog({ state, onClose }: { state: ConfirmState; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-base font-semibold text-slate-900">{state.title}</h3>
        <p className="mt-2 text-sm text-slate-600">{state.message}</p>
        <div className="mt-5 flex gap-3">
          <button type="button" onClick={() => { state.onConfirm(); onClose(); }} className="flex-1 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-red-700">
            {state.confirmLabel}
          </button>
          <button type="button" onClick={onClose} className="flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── SendMessageDialog ──────────────────────────────────────────────────────

function SendMessageDialog({ bookingId, onClose, onSent }: { bookingId: string; onClose: () => void; onSent: () => void }) {
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    if (!message.trim()) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`/api/venue/bookings/${bookingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ custom_message: message.trim() }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error ?? 'Failed to send');
        return;
      }
      onSent();
      onClose();
    } catch {
      setError('Failed to send message');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-base font-semibold text-slate-900">Send Message to Guest</h3>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Type your message..."
          rows={4}
          className="mt-3 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
          autoFocus
        />
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        <div className="mt-4 flex gap-3">
          <button type="button" disabled={sending || !message.trim()} onClick={() => void send()} className="flex-1 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50">
            {sending ? 'Sending...' : 'Send'}
          </button>
          <button type="button" onClick={onClose} className="flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── EditBookingModal ───────────────────────────────────────────────────────

function EditBookingModal({
  booking,
  date,
  onSaved,
  onClose,
}: {
  booking: DaySheetBooking;
  date: string;
  onSaved: () => void;
  onClose: () => void;
}) {
  const [guestName, setGuestName] = useState(booking.guest_name);
  const [phone, setPhone] = useState(booking.guest_phone ?? '');
  const [email, setEmail] = useState(booking.guest_email ?? '');
  const [partySize, setPartySize] = useState(booking.party_size);
  const [time, setTime] = useState(booking.booking_time);
  const [specialRequests, setSpecialRequests] = useState(booking.special_requests ?? '');
  const [internalNotes, setInternalNotes] = useState(booking.internal_notes ?? '');
  const [dietaryNotes, setDietaryNotes] = useState(booking.dietary_notes ?? '');
  const [occasion, setOccasion] = useState(booking.occasion ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {};
      if (guestName !== booking.guest_name) body.guest_name = guestName;
      if (phone !== (booking.guest_phone ?? '')) body.guest_phone = phone || null;
      if (email !== (booking.guest_email ?? '')) body.guest_email = email || null;
      if (partySize !== booking.party_size) body.party_size = partySize;
      if (time !== booking.booking_time) body.booking_time = time;
      if (specialRequests !== (booking.special_requests ?? '')) body.special_requests = specialRequests;
      if (internalNotes !== (booking.internal_notes ?? '')) body.internal_notes = internalNotes;
      if (dietaryNotes !== (booking.dietary_notes ?? '')) body.dietary_notes = dietaryNotes;
      if (occasion !== (booking.occasion ?? '')) body.occasion = occasion;

      if (Object.keys(body).length === 0) {
        onClose();
        return;
      }

      const res = await fetch(`/api/venue/bookings/${booking.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error ?? 'Failed to save');
        return;
      }
      onSaved();
      onClose();
    } catch {
      setError('Failed to save changes');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4 overflow-y-auto" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl my-8" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-base font-semibold text-slate-900">Edit Booking</h3>
        <div className="mt-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Guest Name</label>
              <input value={guestName} onChange={(e) => setGuestName(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Phone</label>
              <input value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500" />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Email</label>
            <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Party Size</label>
              <input value={partySize} onChange={(e) => setPartySize(Number(e.target.value) || 1)} type="number" min={1} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Time</label>
              <input value={time} onChange={(e) => setTime(e.target.value)} type="time" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Date</label>
              <input value={date} disabled className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500" />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Occasion</label>
            <input value={occasion} onChange={(e) => setOccasion(e.target.value)} placeholder="e.g. Birthday, Anniversary" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Dietary Notes</label>
            <input value={dietaryNotes} onChange={(e) => setDietaryNotes(e.target.value)} placeholder="Allergies, dietary requirements" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Special Requests</label>
            <textarea value={specialRequests} onChange={(e) => setSpecialRequests(e.target.value)} rows={2} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Internal Staff Notes</label>
            <textarea value={internalNotes} onChange={(e) => setInternalNotes(e.target.value)} rows={2} placeholder="Staff-only notes (not shown to guest)" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500" />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
        <div className="mt-5 flex gap-3">
          <button type="button" disabled={saving} onClick={() => void save()} className="flex-1 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50">
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
          <button type="button" onClick={onClose} className="flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── WalkInModal (Day Sheet enhanced) ───────────────────────────────────────

function DaySheetWalkInModal({
  remainingCapacity,
  onClose,
  onCreated,
}: {
  remainingCapacity: number | null;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [partySize, setPartySize] = useState(2);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const partySizeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    partySizeRef.current?.focus();
    partySizeRef.current?.select();
  }, []);

  const capacityWarning = useMemo(() => {
    if (remainingCapacity == null) return null;
    if (remainingCapacity <= 0) return 'No capacity remaining — are you sure?';
    if (partySize > remainingCapacity) return 'This may exceed your remaining capacity';
    return null;
  }, [remainingCapacity, partySize]);

  const submit = async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/venue/bookings/walk-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          party_size: partySize,
          name: name.trim() || undefined,
          phone: phone.trim() || undefined,
          notes: notes.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error ?? 'Failed to add walk-in');
        return;
      }
      onCreated();
    } catch {
      setError('Failed to add walk-in');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-900">Walk-in</h2>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Party size</label>
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => setPartySize(Math.max(1, partySize - 1))} className="flex h-12 w-12 items-center justify-center rounded-xl border border-slate-200 text-xl font-bold text-slate-600 hover:bg-slate-50 active:bg-slate-100">−</button>
              <input
                ref={partySizeRef}
                type="number"
                min={1}
                max={50}
                value={partySize}
                onChange={(e) => setPartySize(Math.max(1, Number(e.target.value)))}
                className="h-12 w-20 rounded-xl border border-slate-200 text-center text-xl font-bold tabular-nums focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
              />
              <button type="button" onClick={() => setPartySize(partySize + 1)} className="flex h-12 w-12 items-center justify-center rounded-xl border border-slate-200 text-xl font-bold text-slate-600 hover:bg-slate-50 active:bg-slate-100">+</button>
            </div>
          </div>

          {remainingCapacity != null && (
            <div className={`rounded-lg px-3 py-2 text-sm font-medium ${
              remainingCapacity <= 0 ? 'bg-red-50 text-red-700' :
              remainingCapacity <= 5 ? 'bg-amber-50 text-amber-700' :
              'bg-emerald-50 text-emerald-700'
            }`}>
              Remaining capacity now: {remainingCapacity} covers
            </div>
          )}
          {capacityWarning && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
              ⚠ {capacityWarning}
            </div>
          )}

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Guest name <span className="text-slate-400">(optional)</span></label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Walk-in guest" className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Phone <span className="text-slate-400">(optional)</span></label>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Notes <span className="text-slate-400">(optional)</span></label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Any dietary or special notes" className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500" />
          </div>

          {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

          <div className="flex gap-3 pt-1">
            <button type="button" disabled={loading} onClick={() => void submit()} className="flex-1 rounded-xl bg-brand-600 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 disabled:opacity-50">
              {loading ? 'Seating...' : 'Seat Now →'}
            </button>
            <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-medium text-slate-600 hover:bg-slate-50">
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── NewBookingModal ────────────────────────────────────────────────────────

interface AvailSlot {
  key: string;
  label: string;
  start_time: string;
  available_covers: number;
}

function NewBookingModal({ initialDate, venueId, onCreated, onClose }: { initialDate: string; venueId: string; onCreated: () => void; onClose: () => void }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [partySize, setPartySize] = useState(2);
  const [bookingDate, setBookingDate] = useState(initialDate);
  const [time, setTime] = useState('');
  const [specialRequests, setSpecialRequests] = useState('');
  const [requireDeposit, setRequireDeposit] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [slots, setSlots] = useState<AvailSlot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);

  // Auto-fetch available slots when date or party size changes
  useEffect(() => {
    if (!bookingDate) { setSlots([]); return; }
    let cancelled = false;
    setSlotsLoading(true);
    setTime('');
    (async () => {
      try {
        const res = await fetch(`/api/booking/availability?venue_id=${venueId}&date=${bookingDate}&party_size=${partySize}`);
        if (!res.ok || cancelled) { if (!cancelled) setSlotsLoading(false); return; }
        const data = await res.json();
        const raw: AvailSlot[] = (data.slots ?? []).map((s: { key?: string; label?: string; start_time?: string; available_covers?: number }) => ({
          key: s.key ?? s.start_time ?? '',
          label: s.label ?? s.start_time?.slice(0, 5) ?? '',
          start_time: s.start_time ?? '',
          available_covers: s.available_covers ?? 0,
        })).filter((s: AvailSlot) => s.start_time);
        if (!cancelled) setSlots(raw);
      } catch { /* ignore */ }
      if (!cancelled) setSlotsLoading(false);
    })();
    return () => { cancelled = true; };
  }, [bookingDate, partySize, venueId]);

  const submit = async () => {
    if (!name.trim() || !phone.trim() || !time || !bookingDate) {
      setError('Name, phone, date, and time are required');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/venue/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          booking_date: bookingDate,
          booking_time: time,
          party_size: partySize,
          name: name.trim(),
          phone: phone.trim(),
          email: email.trim() || undefined,
          special_requests: specialRequests.trim() || undefined,
          require_deposit: requireDeposit,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error ?? 'Failed to create booking');
        return;
      }
      onCreated();
      onClose();
    } catch {
      setError('Failed to create booking');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4 overflow-y-auto" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl my-8" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-base font-semibold text-slate-900">New Booking</h3>
        <div className="mt-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Guest Name *</label>
              <input value={name} onChange={(e) => setName(e.target.value)} autoFocus className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Phone *</label>
              <input value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500" />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Email</label>
            <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Party Size</label>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setPartySize(Math.max(1, partySize - 1))} className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-lg font-bold text-slate-600 hover:bg-slate-50">−</button>
              <input value={partySize} onChange={(e) => setPartySize(Math.max(1, Number(e.target.value) || 1))} type="number" min={1} className="h-9 w-16 rounded-lg border border-slate-200 text-center text-sm font-semibold tabular-nums focus:border-brand-500 focus:ring-1 focus:ring-brand-500" />
              <button type="button" onClick={() => setPartySize(partySize + 1)} className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-lg font-bold text-slate-600 hover:bg-slate-50">+</button>
            </div>
          </div>

          {/* Date picker */}
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Date *</label>
            <input
              type="date"
              value={bookingDate}
              onChange={(e) => setBookingDate(e.target.value)}
              min={new Date().toISOString().slice(0, 10)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
            />
          </div>

          {/* Time dropdown */}
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Time *</label>
            {slotsLoading ? (
              <div className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-400">
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                Loading times...
              </div>
            ) : !bookingDate ? (
              <p className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-400">Select a date first</p>
            ) : slots.length === 0 ? (
              <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">No times available for {partySize} cover{partySize !== 1 ? 's' : ''} on {formatDateShort(bookingDate)}</p>
            ) : (
              <select
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
              >
                <option value="">Select a time...</option>
                {slots.map((s) => (
                  <option key={s.key} value={s.start_time}>
                    {s.label} ({s.available_covers} cover{s.available_covers !== 1 ? 's' : ''} available)
                  </option>
                ))}
              </select>
            )}
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Special Requests</label>
            <textarea value={specialRequests} onChange={(e) => setSpecialRequests(e.target.value)} rows={2} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500" />
          </div>

          {/* Deposit toggle */}
          <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2.5">
            <div>
              <p className="text-sm font-medium text-slate-700">Require deposit</p>
              <p className="text-xs text-slate-500">Send a payment link to the guest</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={requireDeposit}
              onClick={() => setRequireDeposit(!requireDeposit)}
              className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ${requireDeposit ? 'bg-brand-600' : 'bg-slate-200'}`}
            >
              <span className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow ring-0 transition-transform duration-200 ${requireDeposit ? 'translate-x-5' : 'translate-x-0'}`} />
            </button>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
        <div className="mt-5 flex gap-3">
          <button type="button" disabled={saving || !time || !bookingDate} onClick={() => void submit()} className="flex-1 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50">
            {saving ? 'Creating...' : 'Create Booking'}
          </button>
          <button type="button" onClick={onClose} className="flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── DepositActions ─────────────────────────────────────────────────────────

function DepositActions({ booking, onAction }: { booking: DaySheetBooking; onAction: () => void }) {
  const [loading, setLoading] = useState(false);
  const { addToast } = useToast();
  const isWalkIn = booking.source === 'walk-in' || booking.source === 'Walk-in';

  const doAction = async (action: string, extra?: Record<string, unknown>) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/venue/bookings/${booking.id}/deposit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...extra }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        addToast(j.error ?? 'Action failed', 'error');
        return;
      }
      addToast('Deposit action completed', 'success');
      onAction();
    } catch {
      addToast('Action failed', 'error');
    } finally {
      setLoading(false);
    }
  };

  const ds = booking.deposit_status;
  const amount = booking.deposit_amount_pence;

  if (ds === 'Paid') {
    return (
      <div className="space-y-1.5">
        <p className="text-sm text-emerald-700">Deposit of {amount ? formatPence(amount) : '—'} paid ✓</p>
        <button type="button" disabled={loading} onClick={() => void doAction('refund')} className="text-xs font-medium text-red-600 hover:text-red-700 disabled:opacity-50">
          Issue Refund
        </button>
      </div>
    );
  }

  if (ds === 'Waived') {
    return <p className="text-sm text-slate-500">Deposit waived</p>;
  }

  if (ds === 'Refunded') {
    return <p className="text-sm text-slate-500">Deposit of {amount ? formatPence(amount) : '—'} refunded</p>;
  }

  if (ds === 'Pending' || ds === 'Requested' || ds === 'Unpaid') {
    return (
      <div className="space-y-1.5">
        <p className="text-sm text-amber-700">Deposit of {amount ? formatPence(amount) : '—'} requested — not yet paid</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={loading} onClick={() => void doAction('send_link')} className="rounded-md bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700 hover:bg-brand-100 disabled:opacity-50">Send Payment Link</button>
          <button type="button" disabled={loading} onClick={() => void doAction('waive')} className="rounded-md bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50">Mark as Waived</button>
          <button type="button" disabled={loading} onClick={() => void doAction('record_cash')} className="rounded-md bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50">Record Cash</button>
        </div>
      </div>
    );
  }

  // Walk-ins and "Not Required" — no deposit actions needed
  if (isWalkIn || ds === 'Not Required') {
    return <p className="text-sm text-slate-400">No deposit required</p>;
  }

  return (
    <div className="space-y-1.5">
      <p className="text-sm text-slate-500">No deposit required</p>
      <button type="button" disabled={loading} onClick={() => void doAction('send_link')} className="text-xs font-medium text-brand-600 hover:text-brand-700 disabled:opacity-50">
        Request Deposit
      </button>
    </div>
  );
}

// ─── Main: DaySheetView ─────────────────────────────────────────────────────

export function DaySheetView({ venueId }: { venueId: string }) {
  const { addToast } = useToast();

  // Core state
  const [date, setDate] = useState(todayISO);
  const [data, setData] = useState<DaySheetData | null>(null);
  const [loading, setLoading] = useState(true);
  const [connection, setConnection] = useState<ConnectionStatus>('amber');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // UI state
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedComms, setExpandedComms] = useState<BookingDetail['communications'] | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmState | null>(null);
  const [showTimeline, setShowTimeline] = useState(false);
  const [showWalkIn, setShowWalkIn] = useState(false);
  const [showNewBooking, setShowNewBooking] = useState(false);
  const [editBooking, setEditBooking] = useState<DaySheetBooking | null>(null);
  const [sendMessageId, setSendMessageId] = useState<string | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [dietaryOpen, setDietaryOpen] = useState(false);

  // Filters
  const [filters, setFilters] = useState<Filters>({
    periodKey: 'all',
    statuses: new Set(DEFAULT_STATUSES),
    search: '',
    showCancelled: false,
    showNoShow: false,
  });
  const hasActiveFilters = useMemo(() => {
    const defaultStatuses = new Set(DEFAULT_STATUSES);
    const sameStatuses = filters.statuses.size === defaultStatuses.size &&
      [...filters.statuses].every((s) => defaultStatuses.has(s));
    return filters.periodKey !== 'all' || !sameStatuses || filters.search !== '' || filters.showCancelled || filters.showNoShow;
  }, [filters]);

  const isToday = useMemo(() => date === todayISO(), [date]);

  // Fetch data
  const fetchDaySheet = useCallback(async (): Promise<boolean> => {
    try {
      const res = await fetch(`/api/venue/day-sheet?date=${date}`);
      if (!res.ok) return false;
      const json = await res.json();
      setData(json);
      setConnection((c) => (c === 'red' ? 'amber' : c));
      return true;
    } catch {
      return false;
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => { setLoading(true); void fetchDaySheet(); }, [fetchDaySheet]);

  // Realtime subscription
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`day-sheet-${venueId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings', filter: `venue_id=eq.${venueId}` }, () => { void fetchDaySheet(); })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setConnection('green');
          if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
        } else {
          setConnection('amber');
        }
      });
    return () => {
      supabase.removeChannel(channel);
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [venueId, fetchDaySheet]);

  // Polling fallback
  useEffect(() => {
    if (connection === 'amber' && !pollRef.current) {
      pollRef.current = setInterval(() => {
        fetchDaySheet().then((ok) => { if (!ok) setConnection('red'); });
      }, POLL_INTERVAL_MS);
    }
    return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
  }, [connection, fetchDaySheet]);

  // Expand booking — fetch comms
  useEffect(() => {
    if (!expandedId) { setExpandedComms(null); return; }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/venue/bookings/${expandedId}`);
        if (!res.ok || cancelled) return;
        const detail = await res.json();
        if (!cancelled) setExpandedComms(detail.communications ?? []);
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, [expandedId]);

  // Status change with optimistic update
  const changeStatus = useCallback(async (bookingId: string, newStatus: BookingStatus) => {
    if (!data) return;
    const currentBooking = data.periods.flatMap((p) => p.bookings).find((b) => b.id === bookingId);
    if (!currentBooking) return;
    const fromStatus = currentBooking.status as BookingStatus;

    if (!BOOKING_STATUS_TRANSITIONS[fromStatus]?.includes(newStatus)) {
      addToast(`Cannot change from ${fromStatus} to ${newStatus}`, 'error');
      return;
    }

    // Optimistic update — recalculate booked_covers and summary
    const snapshot = data;
    setData((prev) => {
      if (!prev) return prev;
      const activeStatuses = ['Pending', 'Confirmed', 'Seated'];
      const updatedPeriods = prev.periods.map((p) => {
        const updatedBookings = p.bookings.map((b) => b.id === bookingId ? { ...b, status: newStatus } : b);
        const bookedCovers = updatedBookings
          .filter((b) => activeStatuses.includes(b.status))
          .reduce((sum, b) => sum + b.party_size, 0);
        return { ...p, bookings: updatedBookings, booked_covers: bookedCovers };
      });
      const allBookings = updatedPeriods.flatMap((p) => p.bookings);
      const totalCovers = allBookings
        .filter((b) => activeStatuses.includes(b.status))
        .reduce((s, b) => s + b.party_size, 0);
      const seatedNow = allBookings
        .filter((b) => b.status === 'Seated')
        .reduce((s, b) => s + b.party_size, 0);
      const maxCap = prev.summary.venue_max_capacity;
      return {
        ...prev,
        periods: updatedPeriods,
        summary: {
          ...prev.summary,
          total_bookings: allBookings.filter((b) => b.status !== 'Cancelled').length,
          total_covers: totalCovers,
          covers_remaining: maxCap != null ? Math.max(0, maxCap - totalCovers) : null,
          pending_count: allBookings.filter((b) => b.status === 'Pending').length,
          seated_covers: seatedNow,
          covers_in_use: seatedNow,
          covers_available_now: maxCap != null ? Math.max(0, maxCap - seatedNow) : null,
          completed_covers: allBookings.filter((b) => b.status === 'Completed').reduce((s, b) => s + b.party_size, 0),
          no_show_covers: allBookings.filter((b) => b.status === 'No-Show').reduce((s, b) => s + b.party_size, 0),
          cancelled_covers: allBookings.filter((b) => b.status === 'Cancelled').reduce((s, b) => s + b.party_size, 0),
        },
      };
    });
    setActionLoading(bookingId);

    try {
      const res = await fetch(`/api/venue/bookings/${bookingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setData(snapshot);
        addToast(j.error ?? 'Failed to update status', 'error');
        return;
      }
      const label = newStatus === 'Confirmed' ? 'Booking confirmed' :
                     newStatus === 'Seated' ? 'Guest checked in' :
                     newStatus === 'Completed' ? 'Booking completed' :
                     newStatus === 'No-Show' ? 'Marked as no-show' :
                     newStatus === 'Cancelled' ? 'Booking cancelled' : 'Status updated';
      addToast(label, 'success');
      void fetchDaySheet();
    } catch {
      setData(snapshot);
      addToast('Failed to update status', 'error');
    } finally {
      setActionLoading(null);
    }
  }, [data, addToast, fetchDaySheet]);

  // Inline notes save
  const saveNotes = useCallback(async (bookingId: string, notes: string) => {
    try {
      await fetch(`/api/venue/bookings/${bookingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ internal_notes: notes }),
      });
    } catch { /* silent */ }
  }, []);

  // Remaining capacity for walk-in — use time-aware API data
  const walkInCapacity = useMemo(() => {
    if (!data || !data.capacity_configured) return null;
    return data.summary.covers_available_now;
  }, [data]);

  // Filter bookings
  const filteredPeriods = useMemo(() => {
    if (!data) return [];
    return data.periods
      .filter((p) => filters.periodKey === 'all' || p.key === filters.periodKey)
      .map((p) => ({
        ...p,
        bookings: p.bookings.filter((b) => {
          if (b.status === 'Cancelled' && !filters.showCancelled && !filters.statuses.has('Cancelled')) return false;
          if (b.status === 'No-Show' && !filters.showNoShow && !filters.statuses.has('No-Show')) return false;
          if (!filters.statuses.has(b.status) && b.status !== 'Cancelled' && b.status !== 'No-Show') return false;
          if (filters.search) {
            const q = filters.search.toLowerCase();
            const nameMatch = b.guest_name.toLowerCase().includes(q);
            const sizeMatch = String(b.party_size) === q;
            if (!nameMatch && !sizeMatch) return false;
          }
          return true;
        }),
      }));
  }, [data, filters]);

  // Loading skeleton
  if (loading && !data) {
    return (
      <div className="space-y-4">
        <div className="h-14 animate-pulse rounded-xl bg-white shadow-sm" />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[...Array(4)].map((_, i) => <div key={i} className="h-20 animate-pulse rounded-xl bg-white shadow-sm" />)}
        </div>
        {[...Array(3)].map((_, i) => <div key={i} className="h-16 animate-pulse rounded-xl bg-white shadow-sm" />)}
      </div>
    );
  }

  if (!data) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-12 text-center">
        <p className="text-slate-500">Unable to load day sheet.</p>
        <button type="button" onClick={() => { setLoading(true); void fetchDaySheet(); }} className="mt-3 text-sm font-medium text-brand-600 hover:text-brand-700">Retry</button>
      </div>
    );
  }

  return (
    <div className="daysheet-root space-y-3">
      {/* ── Toolbar ── */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 shadow-sm print:shadow-none print:border-0 print:px-0">
        {/* Date nav (left) */}
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => setDate(addDays(date, -1))} className="rounded-lg p-2 text-slate-400 hover:bg-slate-50 hover:text-slate-600 print:hidden">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" /></svg>
          </button>
          <div className="relative">
            <button type="button" onClick={() => setShowDatePicker(!showDatePicker)} className="px-2 py-1 text-sm font-semibold text-slate-900 hover:bg-slate-50 rounded-lg">
              {formatDateShort(date)}
              {isToday && <span className="ml-1.5 text-xs font-medium text-brand-600">Today</span>}
            </button>
            {showDatePicker && (
              <input
                type="date"
                value={date}
                onChange={(e) => { setDate(e.target.value || todayISO()); setShowDatePicker(false); }}
                onBlur={() => setShowDatePicker(false)}
                className="absolute left-0 top-full mt-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-lg z-20"
                autoFocus
              />
            )}
          </div>
          <button type="button" onClick={() => setDate(addDays(date, 1))} className="rounded-lg p-2 text-slate-400 hover:bg-slate-50 hover:text-slate-600 print:hidden">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" /></svg>
          </button>
          {!isToday && (
            <button type="button" onClick={() => setDate(todayISO())} className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 print:hidden">
              Today
            </button>
          )}
        </div>

        {/* Filters (centre) */}
        <div className="flex flex-1 flex-wrap items-center gap-2 print:hidden">
          <select
            value={filters.periodKey}
            onChange={(e) => setFilters((f) => ({ ...f, periodKey: e.target.value }))}
            className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 focus:border-brand-500"
          >
            <option value="all">All Periods</option>
            {data.periods.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
          </select>
          <input
            value={filters.search}
            onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
            placeholder="Search guest / party size..."
            className="w-40 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
          />
          <label className="flex items-center gap-1 text-xs text-slate-600">
            <input type="checkbox" checked={filters.statuses.has('Completed')} onChange={(e) => setFilters((f) => { const s = new Set(f.statuses); if (e.target.checked) s.add('Completed'); else s.delete('Completed'); return { ...f, statuses: s }; })} className="rounded border-slate-300" />
            Completed
          </label>
          <label className="flex items-center gap-1 text-xs text-slate-600">
            <input type="checkbox" checked={filters.showCancelled} onChange={(e) => setFilters((f) => ({ ...f, showCancelled: e.target.checked }))} className="rounded border-slate-300" />
            Cancelled
          </label>
          <label className="flex items-center gap-1 text-xs text-slate-600">
            <input type="checkbox" checked={filters.showNoShow} onChange={(e) => setFilters((f) => ({ ...f, showNoShow: e.target.checked }))} className="rounded border-slate-300" />
            No-show
          </label>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={() => setFilters({ periodKey: 'all', statuses: new Set(DEFAULT_STATUSES), search: '', showCancelled: false, showNoShow: false })}
              className="text-xs font-medium text-brand-600 hover:text-brand-700"
            >
              Clear filters
            </button>
          )}
        </div>

        {/* Actions (right) */}
        <div className="flex items-center gap-1.5 print:hidden">
          <button type="button" onClick={() => setShowWalkIn(true)} className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700">
            Walk-in
          </button>
          <button type="button" onClick={() => setShowNewBooking(true)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50">
            + New Booking
          </button>
          <button type="button" onClick={() => window.print()} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">
            Print
          </button>
          <button type="button" onClick={() => { setLoading(true); void fetchDaySheet(); }} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-50 hover:text-slate-600" title="Refresh">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182" /></svg>
          </button>
          <span className={`h-2 w-2 rounded-full ${connection === 'green' ? 'bg-emerald-500' : connection === 'amber' ? 'bg-amber-400 animate-pulse' : 'bg-red-500 animate-pulse'}`} title={connection === 'green' ? 'Live updates' : connection === 'amber' ? 'Polling every 30s' : 'Offline'} />
        </div>
      </div>

      {/* Connection warning */}
      {connection !== 'green' && (
        <div className="flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-1.5 text-xs text-amber-700 print:hidden">
          <span className="h-2 w-2 animate-pulse rounded-full bg-amber-400" />
          {connection === 'amber' ? 'Live updates paused — polling every 30 seconds' : 'Offline — showing last loaded data'}
        </div>
      )}

      {/* Capacity not configured banner */}
      {!data.capacity_configured && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-700 print:hidden">
          Set your venue capacity in Settings → Availability for accurate cover tracking.
        </div>
      )}

      {/* ── Print header ── */}
      <div className="hidden print:block print:mb-4">
        <div className="flex items-baseline justify-between">
          <h1 className="text-lg font-bold text-slate-900">{data.venue_name || 'Venue'}</h1>
          <span className="text-sm text-slate-500">Day Sheet</span>
        </div>
        <p className="text-sm font-medium text-slate-700">{formatDateFull(date)}</p>
      </div>

      {/* ── Summary Bar ── */}
      <SummaryBar
        summary={data.summary}
        capacityConfigured={data.capacity_configured}
      />

      {/* ── Dietary Summary ── */}
      {data.dietary_summary.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm print:shadow-none print:border-slate-300">
          <button
            type="button"
            onClick={() => setDietaryOpen((o) => !o)}
            className="flex w-full items-center justify-between px-4 py-2.5 text-left text-sm font-medium text-slate-700 print:hidden"
          >
            <span className="flex items-center gap-2">
              <svg className="h-4 w-4 text-amber-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" /></svg>
              Dietary &amp; Allergy Notes ({data.dietary_summary.reduce((s, d) => s + d.count, 0)})
            </span>
            <svg className={`h-4 w-4 text-slate-400 transition-transform ${dietaryOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" /></svg>
          </button>
          {(dietaryOpen || false) && (
            <div className="border-t border-slate-100 px-4 py-3">
              <div className="flex flex-wrap gap-2">
                {data.dietary_summary.map(({ label, count, isAllergy }) => (
                  <span key={label} className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium ${
                    isAllergy ? 'bg-red-50 text-red-800 ring-1 ring-red-200' : 'bg-amber-50 text-amber-800'
                  }`}>
                    <span className={`flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold ${isAllergy ? 'bg-red-200 text-red-900' : 'bg-amber-200 text-amber-900'}`}>{count}</span>
                    {label}
                  </span>
                ))}
              </div>
            </div>
          )}
          {/* Print version always shown */}
          <div className="hidden print:block px-4 py-3 border-t border-slate-200">
            <div className="flex flex-wrap gap-2">
              {data.dietary_summary.map(({ label, count, isAllergy }) => (
                <span key={label} className={`text-sm ${isAllergy ? 'font-bold' : ''}`}>{label}: {count}</span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Timeline Breakdown ── */}
      {data.periods.length > 0 && (
        <div className="print:hidden">
          <button
            type="button"
            onClick={() => setShowTimeline((v) => !v)}
            className="mb-1 flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-700"
          >
            {showTimeline ? 'Hide' : 'Show'} capacity timeline
            <svg className={`h-3 w-3 transition-transform ${showTimeline ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" /></svg>
          </button>
          {showTimeline && <TimelineBreakdown periods={data.periods} date={date} />}
        </div>
      )}

      {/* ── Service Period Groups ── */}
      {filteredPeriods.length === 0 && data.periods.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-slate-200 bg-white py-16 text-slate-400">
          <svg className="mb-3 h-10 w-10" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" /></svg>
          <p className="text-sm font-medium">No bookings for {formatDateFull(date)}</p>
          <p className="mt-1 text-xs text-slate-400">Add a booking or check a different date.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredPeriods.map((period) => (
            <div key={period.key} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm print:shadow-none print:break-inside-avoid">
              {/* Period header */}
              <div className="border-b border-slate-100 bg-slate-50/80 px-4 py-3 print:bg-slate-100">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold text-slate-800">{period.label}</span>
                    <span className="text-xs text-slate-500">{period.start_time} – {period.end_time}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    {period.max_covers != null ? (
                      <>
                        <span className="text-xs font-medium tabular-nums text-slate-600">
                          {period.booked_covers} / {period.max_covers} covers
                        </span>
                        <FillBar booked={period.booked_covers} capacity={period.max_covers} />
                      </>
                    ) : (
                      <span className="text-xs text-slate-500">
                        {period.booked_covers} covers · {period.bookings.filter((b) => !isTerminal(b.status)).length} bookings
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Booking list */}
              {period.bookings.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-slate-400">
                  No {period.label.toLowerCase()} bookings yet.
                </div>
              ) : (
                <ul className="divide-y divide-slate-50">
                  {period.bookings.map((b) => {
                    const tags = parseDietaryNotes(b.dietary_notes, b.occasion, b.special_requests);
                    const hasAllergy = tags.some((t) => t.isAllergy) || hasAllergyKeywords([b.dietary_notes, b.special_requests].filter(Boolean).join(' '));
                    const isExpanded = expandedId === b.id;
                    const isTerminalStatus = isTerminal(b.status);
                    const primaryAction = PRIMARY_ACTIONS[b.status];
                    const sStyle = STATUS_STYLE[b.status] ?? STATUS_STYLE.Pending!;
                    const isReturning = b.visit_count > 0;

                    return (
                      <li key={b.id} className={`transition-colors ${isTerminalStatus ? 'bg-slate-50/50 opacity-70' : ''} ${hasAllergy ? 'border-l-4 border-l-red-400' : ''}`}>
                        {/* Collapsed row */}
                        <div
                          role="button"
                          tabIndex={0}
                          onClick={() => setExpandedId(isExpanded ? null : b.id)}
                          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpandedId(isExpanded ? null : b.id); } }}
                          className={`flex w-full cursor-pointer items-center gap-2 px-4 py-3 text-left transition-colors ${isExpanded ? 'bg-brand-50/40' : 'hover:bg-slate-50/80'}`}
                        >
                          {/* Status badge */}
                          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${sStyle.bg} ${sStyle.text}`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${sStyle.dot}`} />
                            {b.status}
                          </span>

                          {/* Time */}
                          <span className="w-12 text-xs font-semibold tabular-nums text-slate-600">{b.booking_time}</span>

                          {/* Guest name + indicators */}
                          <div className="flex min-w-0 flex-1 items-center gap-1.5">
                            <span className={`truncate text-sm font-medium ${b.status === 'Cancelled' ? 'line-through text-slate-400' : 'text-slate-900'}`}>
                              {b.guest_name}
                            </span>
                            {isReturning && <span className="text-amber-500" title={`${ordinal(b.visit_count + 1)} visit`}>★</span>}
                            {b.internal_notes && <span className="text-slate-400" title="Staff notes">📝</span>}
                            {b.source === 'Walk-in' && <span className="rounded bg-slate-100 px-1 py-0.5 text-[9px] font-medium text-slate-500 print:hidden">Walk-in</span>}
                            {b.source === 'Online' && <span className="rounded bg-blue-50 px-1 py-0.5 text-[9px] font-medium text-blue-600 print:hidden">Online</span>}
                            {b.source === 'Phone' && <span className="rounded bg-slate-100 px-1 py-0.5 text-[9px] font-medium text-slate-500 print:hidden">Phone</span>}
                            {b.source === 'Staff' && <span className="rounded bg-purple-50 px-1 py-0.5 text-[9px] font-medium text-purple-600 print:hidden">Staff</span>}
                          </div>

                          {/* Party size */}
                          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-sm font-bold tabular-nums text-slate-800">
                            {b.party_size}
                          </span>

                          {/* Deposit badge (hidden in print per spec, hidden for walk-ins/not required) */}
                          {b.deposit_status && !['N/A', 'Not Required'].includes(b.deposit_status) && b.source !== 'walk-in' && b.source !== 'Walk-in' && (
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold print:hidden ${
                              b.deposit_status === 'Paid' ? 'bg-emerald-100 text-emerald-700' :
                              b.deposit_status === 'Waived' ? 'bg-slate-100 text-slate-600' :
                              b.deposit_status === 'Refunded' ? 'bg-slate-100 text-slate-500' :
                              'bg-red-100 text-red-700'
                            }`}>
                              {b.deposit_status === 'Paid' ? '£ Paid' : b.deposit_status === 'Waived' ? 'Waived' : b.deposit_status === 'Refunded' ? 'Refunded' : '£ Due'}
                            </span>
                          )}

                          {/* Primary action */}
                          {primaryAction && !isTerminalStatus && (
                            <button
                              type="button"
                              disabled={actionLoading === b.id}
                              onClick={(e) => {
                                e.stopPropagation();
                                void changeStatus(b.id, primaryAction.target);
                              }}
                              className={`rounded-lg px-3 py-1.5 text-xs font-semibold text-white shadow-sm disabled:opacity-50 print:hidden ${
                                primaryAction.target === 'Confirmed' ? 'bg-teal-600 hover:bg-teal-700' :
                                primaryAction.target === 'Seated' ? 'bg-blue-600 hover:bg-blue-700' :
                                'bg-slate-600 hover:bg-slate-700'
                              }`}
                            >
                              {actionLoading === b.id ? '...' : primaryAction.label}
                            </button>
                          )}

                          {/* Expand indicator */}
                          <span className="text-slate-300 print:hidden" aria-hidden="true">›</span>
                        </div>

                        {/* Dietary/special requests line */}
                        {(tags.length > 0 || b.special_requests) && (
                          <div className={`px-4 pb-2 space-y-1 ${isTerminalStatus ? 'opacity-60' : ''}`}>
                            {tags.length > 0 && (
                              <div className="flex flex-wrap items-center gap-1.5">
                                {tags.map((t) => (
                                  <span key={t.label} className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                                    t.isAllergy ? 'bg-red-100 text-red-800 ring-1 ring-red-200' : 'bg-amber-50 text-amber-700'
                                  }`}>
                                    {t.isAllergy && <span className="text-red-500">⚠</span>}
                                    {t.icon} {t.label}
                                  </span>
                                ))}
                              </div>
                            )}
                            {b.special_requests && (
                              <p className={`text-xs ${hasAllergy ? 'font-semibold text-red-800' : 'text-slate-500 italic'}`}>
                                {b.special_requests}
                              </p>
                            )}
                          </div>
                        )}

                        {/* Internal notes for print only */}
                        {b.internal_notes && (
                          <div className="hidden print:block px-4 pb-2">
                            <p className="text-xs text-slate-600 italic">Internal note: {b.internal_notes}</p>
                          </div>
                        )}

                        {/* ── Expanded detail ── */}
                        {isExpanded && (
                          <div className="border-t border-slate-100 bg-slate-50/30 px-4 py-4 space-y-4">
                            {/* Guest info */}
                            <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                              <div>
                                <span className="text-xs text-slate-500">Guest</span>
                                <p className="font-medium text-slate-900">{b.guest_name}</p>
                              </div>
                              <div>
                                <span className="text-xs text-slate-500">Party Size</span>
                                <p className="font-medium text-slate-900">{b.party_size} covers</p>
                              </div>
                              <div>
                                <span className="text-xs text-slate-500">Phone</span>
                                {b.guest_phone ? (
                                  <a href={`tel:${b.guest_phone}`} className="block font-medium text-brand-600 hover:text-brand-700">{b.guest_phone}</a>
                                ) : (
                                  <p className="text-slate-400">—</p>
                                )}
                              </div>
                              <div>
                                <span className="text-xs text-slate-500">Email</span>
                                {b.guest_email ? (
                                  <a href={`mailto:${b.guest_email}`} className="block font-medium text-brand-600 hover:text-brand-700 truncate">{b.guest_email}</a>
                                ) : (
                                  <p className="text-slate-400">—</p>
                                )}
                              </div>
                              <div>
                                <span className="text-xs text-slate-500">Time</span>
                                <p className="font-medium text-slate-900">{b.booking_time}{b.estimated_end_time ? ` – ${b.estimated_end_time}` : ''}</p>
                              </div>
                              <div>
                                <span className="text-xs text-slate-500">Source</span>
                                <p className="font-medium text-slate-700">{b.source}</p>
                              </div>
                              <div>
                                <span className="text-xs text-slate-500">Created</span>
                                <p className="text-slate-600">{new Date(b.created_at).toLocaleString()}</p>
                              </div>
                              <div>
                                <span className="text-xs text-slate-500">Visit History</span>
                                <p className="font-medium text-slate-700">
                                  {b.visit_count === 0 ? 'First visit' : `${ordinal(b.visit_count + 1)} visit`}
                                  {b.no_show_count > 0 && <span className="ml-1 text-xs text-red-500">({b.no_show_count} no-show{b.no_show_count > 1 ? 's' : ''})</span>}
                                </p>
                              </div>
                            </div>

                            {/* Special requests */}
                            {b.special_requests && (
                              <div>
                                <span className="text-xs text-slate-500">Special Requests</span>
                                <p className={`mt-0.5 text-sm ${hasAllergy ? 'font-semibold text-red-800' : 'text-slate-700'}`}>{b.special_requests}</p>
                              </div>
                            )}

                            {/* Dietary */}
                            {b.dietary_notes && (
                              <div>
                                <span className="text-xs text-slate-500">Dietary Notes</span>
                                <p className={`mt-0.5 text-sm ${hasAllergy ? 'font-semibold text-red-800' : 'text-slate-700'}`}>{b.dietary_notes}</p>
                              </div>
                            )}

                            {/* Occasion */}
                            {b.occasion && (
                              <div>
                                <span className="text-xs text-slate-500">Occasion</span>
                                <p className="mt-0.5 text-sm text-slate-700">{b.occasion}</p>
                              </div>
                            )}

                            {/* Internal notes (editable) */}
                            <div>
                              <span className="text-xs text-slate-500">Internal Staff Notes</span>
                              <textarea
                                defaultValue={b.internal_notes ?? ''}
                                onBlur={(e) => void saveNotes(b.id, e.target.value)}
                                rows={2}
                                placeholder="Add staff-only notes..."
                                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                              />
                            </div>

                            {/* Deposit */}
                            <div>
                              <span className="text-xs text-slate-500">Deposit</span>
                              <div className="mt-1">
                                <DepositActions booking={b} onAction={() => void fetchDaySheet()} />
                              </div>
                            </div>

                            {/* Communications log */}
                            <div>
                              <span className="text-xs text-slate-500">Communications</span>
                              {expandedComms == null ? (
                                <p className="mt-1 text-xs text-slate-400">Loading...</p>
                              ) : expandedComms.length === 0 ? (
                                <p className="mt-1 text-xs text-slate-400">No messages sent</p>
                              ) : (
                                <ul className="mt-1 space-y-1 max-h-32 overflow-y-auto">
                                  {expandedComms.map((c) => (
                                    <li key={c.id} className="flex items-center gap-2 text-xs text-slate-600">
                                      <span className={`rounded px-1.5 py-0.5 font-medium ${c.channel === 'sms' ? 'bg-blue-50 text-blue-700' : 'bg-slate-50 text-slate-600'}`}>{c.channel.toUpperCase()}</span>
                                      <span>{c.message_type.replace(/_/g, ' ')}</span>
                                      <span className={c.status === 'sent' ? 'text-emerald-600' : 'text-red-500'}>{c.status}</span>
                                      <span className="text-slate-400">{new Date(c.created_at).toLocaleString()}</span>
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>

                            {/* Action buttons */}
                            <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-3 print:hidden">
                              <button type="button" onClick={() => setEditBooking(b)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50">
                                Edit Booking
                              </button>
                              <button type="button" onClick={() => setSendMessageId(b.id)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50">
                                Send Message
                              </button>
                              {b.status === 'Confirmed' && (
                                <button
                                  type="button"
                                  disabled={actionLoading === b.id || !canNoShow(b.booking_time, date, data.no_show_grace_minutes)}
                                  title={!canNoShow(b.booking_time, date, data.no_show_grace_minutes) ? `Available ${data.no_show_grace_minutes} min after booking time` : undefined}
                                  onClick={() => setConfirmDialog({
                                    title: 'Mark as No-Show',
                                    message: 'Mark this booking as a no-show? This cannot be undone.',
                                    confirmLabel: 'Mark No-Show',
                                    onConfirm: () => void changeStatus(b.id, 'No-Show'),
                                  })}
                                  className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                                >
                                  No-Show
                                </button>
                              )}
                              {(b.status === 'Pending' || b.status === 'Confirmed') && (
                                <button
                                  type="button"
                                  disabled={actionLoading === b.id}
                                  onClick={() => setConfirmDialog({
                                    title: 'Cancel Booking',
                                    message: 'Cancel this booking? A cancellation message will be sent to the guest.',
                                    confirmLabel: 'Cancel Booking',
                                    onConfirm: () => void changeStatus(b.id, 'Cancelled'),
                                  })}
                                  className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                                >
                                  Cancel Booking
                                </button>
                              )}
                            </div>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Modals ── */}
      {showWalkIn && (
        <DaySheetWalkInModal
          remainingCapacity={walkInCapacity}
          onClose={() => setShowWalkIn(false)}
          onCreated={() => {
            setShowWalkIn(false);
            addToast('Walk-in added', 'success');
            void fetchDaySheet();
          }}
        />
      )}
      {showNewBooking && (
        <NewBookingModal
          initialDate={date}
          venueId={venueId}
          onCreated={() => {
            addToast('Booking created', 'success');
            void fetchDaySheet();
          }}
          onClose={() => setShowNewBooking(false)}
        />
      )}
      {editBooking && (
        <EditBookingModal
          booking={editBooking}
          date={date}
          onSaved={() => {
            addToast('Booking updated', 'success');
            void fetchDaySheet();
          }}
          onClose={() => setEditBooking(null)}
        />
      )}
      {sendMessageId && (
        <SendMessageDialog
          bookingId={sendMessageId}
          onClose={() => setSendMessageId(null)}
          onSent={() => {
            addToast('Message sent', 'success');
            void fetchDaySheet();
          }}
        />
      )}
      {confirmDialog && (
        <ConfirmDialog state={confirmDialog} onClose={() => setConfirmDialog(null)} />
      )}

      {/* ── Print Footer (print only) ── */}
      <div className="hidden print:block print:fixed print:bottom-0 print:left-0 print:right-0 print:border-t print:border-slate-200 print:py-2 print:px-6 print:text-xs print:text-slate-400 print:text-center">
        Printed {new Date().toLocaleString()} — ReserveNI
      </div>

      {/* ── Print styles ── */}
      <style>{`
        @media print {
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          nav, .print\\:hidden, [data-sidebar], header {
            display: none !important;
          }
          .daysheet-root { padding: 0 !important; max-width: 100% !important; }
          .daysheet-root > * { break-inside: avoid; }
          @page { margin: 1.5cm; size: A4 portrait; }
          @page :first { margin-top: 1cm; }
        }
      `}</style>
    </div>
  );
}
