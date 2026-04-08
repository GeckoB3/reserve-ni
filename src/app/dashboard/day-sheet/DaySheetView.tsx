'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/browser';
import { parseDietaryNotes, hasAllergyKeywords } from '@/lib/day-sheet';
import { useToast } from '@/components/ui/Toast';
import { NumericInput } from '@/components/ui/NumericInput';
import {
  BOOKING_PRIMARY_ACTIONS,
  BOOKING_REVERT_ACTIONS,
  canMarkNoShowForSlot,
  canTransitionBookingStatus,
  isDestructiveBookingStatus,
  type BookingStatus,
} from '@/lib/table-management/booking-status';
import { UndoToast } from '@/app/dashboard/table-grid/UndoToast';
import type { UndoAction } from '@/types/table-management';
import { DashboardStaffBookingModal } from '@/components/booking/DashboardStaffBookingModal';
import type { BookingModel } from '@/types/booking-models';
import { ModifyBookingInline } from '@/components/booking/ModifyBookingInline';
import { BookingNotesEditablePanel } from '@/components/booking/BookingNotesEditablePanel';
import { DashboardStatCard } from '@/components/dashboard/DashboardStatCard';
import { bookingStatusDisplayLabel, isTableReservationBooking } from '@/lib/booking/infer-booking-row-model';
import {
  computeNextBookingsSlotFromBookingRows,
  nextBookingsTileContent,
} from '@/lib/table-management/next-bookings-slot';
import { TableSelector } from '@/components/table-tracking/TableSelector';
import type { OccupancyMap } from '@/components/table-tracking/TableSelector';
import type { CountryCode } from 'libphonenumber-js';
import { PhoneWithCountryField } from '@/components/phone/PhoneWithCountryField';
import { normalizeToE164 } from '@/lib/phone/e164';
import { defaultPhoneCountryForVenueCurrency } from '@/lib/phone/default-country';
import { HorizontalScrollHint } from '@/components/ui/HorizontalScrollHint';

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
  guest_tags?: string[];
  table_assignments?: Array<{ id: string; name: string }>;
  experience_event_id?: string | null;
  class_instance_id?: string | null;
  resource_id?: string | null;
  event_session_id?: string | null;
  calendar_id?: string | null;
  service_item_id?: string | null;
  practitioner_id?: string | null;
  appointment_service_id?: string | null;
}

interface ActiveTable {
  id: string;
  name: string;
  max_covers: number;
  sort_order: number;
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
  active_tables?: ActiveTable[];
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
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const POLL_INTERVAL_MS = 30_000;

const STATUS_STYLE: Record<string, { dot: string; bg: string; text: string; ring: string }> = {
  Pending:   { dot: 'bg-amber-500',   bg: 'bg-amber-50',   text: 'text-amber-700',   ring: 'ring-amber-200' },
  Confirmed: { dot: 'bg-teal-500',    bg: 'bg-teal-50',    text: 'text-teal-700',    ring: 'ring-teal-200' },
  Seated:    { dot: 'bg-brand-600',    bg: 'bg-brand-50',    text: 'text-brand-800',    ring: 'ring-brand-200' },
  Completed: { dot: 'bg-slate-400',   bg: 'bg-slate-50',   text: 'text-slate-500',   ring: 'ring-slate-200' },
  'No-Show': { dot: 'bg-red-500',     bg: 'bg-red-50',     text: 'text-red-700',     ring: 'ring-red-200' },
  Cancelled: { dot: 'bg-slate-300',   bg: 'bg-slate-50',   text: 'text-slate-400',   ring: 'ring-slate-200' },
};

const PRIMARY_ACTIONS: Record<string, { label: string; target: BookingStatus }> = {
  Pending:   BOOKING_PRIMARY_ACTIONS.Pending!,
  Confirmed: BOOKING_PRIMARY_ACTIONS.Confirmed!,
  Seated:    BOOKING_PRIMARY_ACTIONS.Seated!,
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
/** Long heading - matches table grid / live floor date strip. */
function formatDateHeading(date: string): string {
  const d = new Date(`${date}T12:00:00`);
  return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}
/** Relative day label - matches dashboard/bookings concertina. */
function formatDateNice(dateStr: string): string {
  const d = new Date(`${dateStr}T12:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === tomorrow.toDateString()) return 'Tomorrow';
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
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
const isTerminal = isDestructiveBookingStatus;

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

// ─── Day sheet stats row (same card language as table grid / floor plan SummaryBar) ──

function DaySheetStatsRow({
  summary,
  periods,
}: {
  summary: DaySheetData['summary'];
  periods: DaySheetPeriod[];
}) {
  const isTodayView = summary.is_today;

  const bookingRows = periods.flatMap((p) =>
    p.bookings.map((b) => ({
      id: b.id,
      start_time: b.booking_time,
      party_size: b.party_size,
      status: b.status,
    })),
  );
  const refMinutes = isTodayView ? new Date().getHours() * 60 + new Date().getMinutes() : 0;
  const nextBookingsSlot = computeNextBookingsSlotFromBookingRows(bookingRows, refMinutes);
  const nextBookings = nextBookingsTileContent(nextBookingsSlot);

  const cap = summary.venue_max_capacity;
  const coversPct =
    cap != null && cap > 0 ? Math.round((summary.covers_in_use / cap) * 100) : 0;

  const avail = summary.covers_available_now;

  if (isTodayView) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 print:grid-cols-4">
        <DashboardStatCard
          label="Covers in use"
          value={cap != null ? `${summary.covers_in_use}/${cap}` : summary.covers_in_use}
          color="blue"
          subValue={cap != null && cap > 0 ? `${coversPct}% of capacity` : undefined}
        />
        <DashboardStatCard
          label="Available now"
          value={avail != null ? avail : '-'}
          color="violet"
        />
        <DashboardStatCard label="Bookings" value={summary.total_bookings} color="emerald" />
        <DashboardStatCard
          value={nextBookings.primaryValue}
          color="amber"
          subValue={nextBookings.guestsLine}
          subValue2={nextBookings.bookingsLine}
        />
      </div>
    );
  }

  const rem = summary.covers_remaining;
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 print:grid-cols-4">
      <DashboardStatCard label="Total covers" value={summary.total_covers} color="blue" />
      <DashboardStatCard
        label="Remaining"
        value={rem != null ? rem : '-'}
        color="violet"
      />
      <DashboardStatCard label="Bookings" value={summary.total_bookings} color="emerald" />
      <DashboardStatCard
        value={nextBookings.primaryValue}
        color="amber"
        subValue={nextBookings.guestsLine}
        subValue2={nextBookings.bookingsLine}
      />
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
    <div>
      <HorizontalScrollHint />
      <div className="touch-pan-x overflow-x-auto rounded-lg border border-slate-200 bg-white print:hidden">
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
  venueId,
  onSaved,
  onClose,
}: {
  booking: DaySheetBooking;
  date: string;
  venueId: string;
  onSaved: () => void;
  onClose: () => void;
}) {
  const [guestName, setGuestName] = useState(booking.guest_name);
  const [phone, setPhone] = useState(booking.guest_phone ?? '');
  const [email, setEmail] = useState(booking.guest_email ?? '');
  const [specialRequests, setSpecialRequests] = useState(booking.special_requests ?? '');
  const [internalNotes, setInternalNotes] = useState(booking.internal_notes ?? '');
  const [dietaryNotes, setDietaryNotes] = useState(booking.dietary_notes ?? '');
  const [occasion, setOccasion] = useState(booking.occasion ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dateTimeSaved, setDateTimeSaved] = useState(false);

  const saveGuestDetails = async () => {
    setSaving(true);
    setError(null);
    try {
      if (phone.trim() && !normalizeToE164(phone, 'GB')) {
        setError('Enter a valid phone number');
        setSaving(false);
        return;
      }
      const resolvedPhone = phone.trim() ? (normalizeToE164(phone, 'GB') ?? phone.trim()) : '';
      const body: Record<string, unknown> = {};
      if (guestName !== booking.guest_name) body.guest_name = guestName;
      if (resolvedPhone !== (booking.guest_phone ?? '')) body.guest_phone = resolvedPhone || null;
      if (email !== (booking.guest_email ?? '')) body.guest_email = email || null;
      if (specialRequests !== (booking.special_requests ?? '')) body.special_requests = specialRequests;
      if (internalNotes !== (booking.internal_notes ?? '')) body.internal_notes = internalNotes;
      if (dietaryNotes !== (booking.dietary_notes ?? '')) body.dietary_notes = dietaryNotes;
      if (occasion !== (booking.occasion ?? '')) body.occasion = occasion;

      if (Object.keys(body).length === 0 && !dateTimeSaved) {
        onClose();
        return;
      }

      if (Object.keys(body).length > 0) {
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
        <div className="mt-4 space-y-4">
          {/* Date / Time / Party Size via availability-aware component */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3.5">
            <p className="mb-2.5 text-xs font-semibold text-slate-700">Date / Time / Party Size</p>
            <ModifyBookingInline
              bookingId={booking.id}
              venueId={venueId}
              currentDate={date}
              currentTime={booking.booking_time}
              currentPartySize={booking.party_size}
              onSaved={() => { setDateTimeSaved(true); onSaved(); }}
              onCancel={() => {}}
            />
          </div>

          {/* Guest details */}
          <div className="space-y-3">
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Guest Name</label>
                <input value={guestName} onChange={(e) => setGuestName(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Phone</label>
                <PhoneWithCountryField
                  value={phone}
                  onChange={setPhone}
                  inputClassName="w-full min-w-0 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Email</label>
              <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500" />
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
        </div>
        <div className="mt-5 flex gap-3">
          <button type="button" disabled={saving} onClick={() => void saveGuestDetails()} className="flex-1 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50">
            {saving ? 'Saving...' : 'Save Guest Details'}
          </button>
          <button type="button" onClick={onClose} className="flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50">
            Close
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
        <p className="text-sm text-emerald-700">Deposit of {amount ? formatPence(amount) : '-'} paid ✓</p>
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
    return <p className="text-sm text-slate-500">Deposit of {amount ? formatPence(amount) : '-'} refunded</p>;
  }

  if (ds === 'Pending' || ds === 'Requested' || ds === 'Unpaid') {
    return (
      <div className="space-y-1.5">
        <p className="text-sm text-amber-700">Deposit of {amount ? formatPence(amount) : '-'} requested - not yet paid</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={loading} onClick={() => void doAction('send_link')} className="rounded-md bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700 hover:bg-brand-100 disabled:opacity-50">Send Payment Link</button>
          <button type="button" disabled={loading} onClick={() => void doAction('waive')} className="rounded-md bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50">Mark as Waived</button>
          <button type="button" disabled={loading} onClick={() => void doAction('record_cash')} className="rounded-md bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50">Record Cash</button>
        </div>
      </div>
    );
  }

  // Walk-ins and "Not Required" - no deposit actions needed
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

export function DaySheetView({
  venueId,
  currency,
  bookingModel = 'table_reservation',
  enabledModels = [],
}: {
  venueId: string;
  currency?: string;
  bookingModel?: BookingModel;
  enabledModels?: BookingModel[];
}) {
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
  const [undoAction, setUndoAction] = useState<UndoAction | null>(null);
  const [tableManagementEnabled, setTableManagementEnabled] = useState(false);
  const [seatWithTableBookingId, setSeatWithTableBookingId] = useState<string | null>(null);
  const [seatSelectedTableIds, setSeatSelectedTableIds] = useState<string[]>([]);
  const [changeTableBookingId, setChangeTableBookingId] = useState<string | null>(null);
  const [changeTableSelectedIds, setChangeTableSelectedIds] = useState<string[]>([]);
  const [highlightBookingId, setHighlightBookingId] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch('/api/venue/tables');
        if (!res.ok) return;
        const payload = await res.json();
        setTableManagementEnabled(Boolean(payload.settings?.table_management_enabled));
      } catch { /* noop */ }
    })();
  }, []);

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

  const activeTables = useMemo(() => data?.active_tables ?? [], [data]);

  const occupancyMap = useMemo<OccupancyMap>(() => {
    const map: OccupancyMap = {};
    if (!data) return map;
    for (const t of activeTables) map[t.id] = null;
    for (const period of data.periods) {
      for (const b of period.bookings) {
        if (b.status !== 'Seated' || !b.table_assignments?.length) continue;
        for (const ta of b.table_assignments) {
          map[ta.id] = { bookingId: b.id, guestName: b.guest_name };
        }
      }
    }
    return map;
  }, [data, activeTables]);

  const changeTableOccupancyMap = useMemo<OccupancyMap>(() => {
    const map: OccupancyMap = {};
    if (!data || !changeTableBookingId) return map;
    for (const t of activeTables) map[t.id] = null;
    for (const period of data.periods) {
      for (const b of period.bookings) {
        if (b.id === changeTableBookingId) continue;
        if (b.status !== 'Seated' || !b.table_assignments?.length) continue;
        for (const ta of b.table_assignments) {
          map[ta.id] = { bookingId: b.id, guestName: b.guest_name };
        }
      }
    }
    return map;
  }, [data, activeTables, changeTableBookingId]);

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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'booking_table_assignments' }, () => { void fetchDaySheet(); })
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

  // Expand booking - fetch comms
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

    if (!canTransitionBookingStatus(fromStatus, newStatus)) {
      addToast(`Cannot change from ${fromStatus} to ${newStatus}`, 'error');
      return;
    }

    // Optimistic update - recalculate booked_covers and summary
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
      const tableStyle = isTableReservationBooking(currentBooking);
      setUndoAction({
        id: crypto.randomUUID(),
        type: 'change_status',
        description: `${currentBooking.guest_name}: ${bookingStatusDisplayLabel(fromStatus, tableStyle)} -> ${bookingStatusDisplayLabel(newStatus, tableStyle)}`,
        timestamp: Date.now(),
        previous_state: { bookingId, status: fromStatus },
        current_state: { bookingId, status: newStatus },
      });
      void fetchDaySheet();
    } catch {
      setData(snapshot);
      addToast('Failed to update status', 'error');
    } finally {
      setActionLoading(null);
    }
  }, [data, addToast, fetchDaySheet]);

  const undoStatusChange = useCallback(async () => {
    if (!undoAction || undoAction.type !== 'change_status') return;
    const bookingId = String(undoAction.previous_state.bookingId ?? '');
    const previousStatus = String(undoAction.previous_state.status ?? '') as BookingStatus;
    if (!bookingId || !previousStatus) return;
    setUndoAction(null);
    await changeStatus(bookingId, previousStatus);
  }, [undoAction, changeStatus]);

  // Remaining capacity for walk-in - use time-aware API data
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
        <div className="h-16 animate-pulse rounded-xl bg-slate-100/80" />
        <div className="h-14 animate-pulse rounded-xl bg-slate-100/80" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-slate-100/80" />
          ))}
        </div>
        <div className="h-14 animate-pulse rounded-xl bg-slate-100/80" />
        {[...Array(2)].map((_, i) => (
          <div key={i} className="h-16 animate-pulse rounded-xl bg-slate-100/80" />
        ))}
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
    <div className="daysheet-root space-y-4">
      {/* Row 1 - matches table grid / live floor (Operations + primary actions) */}
      <div className="flex flex-col gap-3 print:hidden sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Operations</p>
          <h1 className="truncate text-lg font-semibold text-slate-900 sm:text-xl">Day sheet</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setDate(todayISO())}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 shadow-sm hover:bg-slate-50"
          >
            Today
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 shadow-sm hover:bg-slate-50"
          >
            Print
          </button>
          <button
            type="button"
            onClick={() => {
              setLoading(true);
              void fetchDaySheet();
            }}
            className="rounded-lg border border-slate-200 bg-white p-2 text-slate-500 shadow-sm hover:bg-slate-50 hover:text-slate-700"
            aria-label="Refresh"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182" />
            </svg>
          </button>
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${
              connection === 'green'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                : connection === 'amber'
                  ? 'border-amber-200 bg-amber-50 text-amber-700'
                  : 'border-red-200 bg-red-50 text-red-700'
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                connection === 'green' ? 'bg-emerald-500' : connection === 'amber' ? 'bg-amber-500 animate-pulse' : 'bg-red-500 animate-pulse'
              }`}
            />
            {connection === 'green' ? 'Live' : connection === 'amber' ? 'Polling' : 'Offline'}
          </span>
          <button
            type="button"
            onClick={() => setShowNewBooking(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-brand-700"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            New Booking
          </button>
          <button
            type="button"
            onClick={() => setShowWalkIn(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-emerald-700"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
            </svg>
            Walk-in
          </button>
        </div>
      </div>

      {/* Row 2 - date navigator (same card treatment as table grid / floor) */}
      <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-3 shadow-sm print:hidden sm:px-4">
        <button
          type="button"
          onClick={() => setDate(addDays(date, -1))}
          className="rounded-lg p-2 text-slate-400 hover:bg-slate-50 hover:text-slate-600"
          aria-label="Previous day"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
          </svg>
        </button>
        <div className="relative min-w-0 flex-1 px-2 text-center">
          <button
            type="button"
            onClick={() => setShowDatePicker((o) => !o)}
            className="w-full rounded-lg py-1 hover:bg-slate-50/80"
          >
            <h2 className="truncate text-sm font-semibold text-slate-900 sm:text-base">{formatDateHeading(date)}</h2>
            {isToday && <span className="text-xs font-medium text-brand-600">Today</span>}
          </button>
          {showDatePicker && (
            <input
              type="date"
              value={date}
              onChange={(e) => {
                setDate(e.target.value || todayISO());
                setShowDatePicker(false);
              }}
              onBlur={() => setShowDatePicker(false)}
              className="absolute left-1/2 top-full z-20 mt-1 -translate-x-1/2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-lg"
              autoFocus
            />
          )}
        </div>
        <button
          type="button"
          onClick={() => setDate(addDays(date, 1))}
          className="rounded-lg p-2 text-slate-400 hover:bg-slate-50 hover:text-slate-600"
          aria-label="Next day"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
          </svg>
        </button>
      </div>

      {/* Connection warning */}
      {connection !== 'green' && (
        <div className="flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-1.5 text-xs text-amber-700 print:hidden">
          <span className="h-2 w-2 animate-pulse rounded-full bg-amber-400" />
          {connection === 'amber' ? 'Live updates paused - polling every 30 seconds' : 'Offline - showing last loaded data'}
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

      {/* Row 3 - stat cards (aligned with table grid / floor plan) */}
      <DaySheetStatsRow summary={data.summary} periods={data.periods} />

      {/* Row 4 - filters (toolbar tools card, same as grid/floor filter strip) */}
      <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm print:hidden sm:flex-row sm:flex-wrap sm:items-center">
        <select
          value={filters.periodKey}
          onChange={(e) => setFilters((f) => ({ ...f, periodKey: e.target.value }))}
          className="rounded-lg border border-slate-200 px-2.5 py-2 text-sm font-medium text-slate-700 focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
        >
          <option value="all">All periods</option>
          {data.periods.map((p) => (
            <option key={p.key} value={p.key}>
              {p.label}
            </option>
          ))}
        </select>
        <input
          value={filters.search}
          onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
          placeholder="Search guest / party size…"
          className="min-w-[10rem] flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 sm:max-w-xs"
        />
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={filters.statuses.has('Completed')}
            onChange={(e) =>
              setFilters((f) => {
                const s = new Set(f.statuses);
                if (e.target.checked) s.add('Completed');
                else s.delete('Completed');
                return { ...f, statuses: s };
              })
            }
            className="rounded border-slate-300"
          />
          Completed
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={filters.showCancelled}
            onChange={(e) => setFilters((f) => ({ ...f, showCancelled: e.target.checked }))}
            className="rounded border-slate-300"
          />
          Cancelled
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={filters.showNoShow}
            onChange={(e) => setFilters((f) => ({ ...f, showNoShow: e.target.checked }))}
            className="rounded border-slate-300"
          />
          No-show
        </label>
        {hasActiveFilters && (
          <button
            type="button"
            onClick={() =>
              setFilters({
                periodKey: 'all',
                statuses: new Set(DEFAULT_STATUSES),
                search: '',
                showCancelled: false,
                showNoShow: false,
              })
            }
            className="text-sm font-medium text-brand-600 hover:text-brand-700"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* ── Table Status Strip ── */}
      {activeTables.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm print:hidden">
          <span className="mr-1 text-xs font-semibold text-slate-500">Tables</span>
          {activeTables.map((table) => {
            const occupant = occupancyMap[table.id] ?? null;
            const isOccupied = occupant !== null;
            return (
              <button
                key={table.id}
                type="button"
                title={isOccupied ? `${table.name} - ${occupant.guestName}` : `${table.name} (${table.max_covers} seats) - available`}
                onClick={() => {
                  if (isOccupied) {
                    setHighlightBookingId(occupant.bookingId);
                    const el = document.getElementById(`booking-row-${occupant.bookingId}`);
                    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    setTimeout(() => setHighlightBookingId(null), 2000);
                  }
                }}
                className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors ${
                  isOccupied
                    ? 'border-red-200 bg-red-50 text-red-700 hover:bg-red-100 cursor-pointer'
                    : 'border-emerald-200 bg-emerald-50 text-emerald-700 cursor-default'
                }`}
              >
                {table.name}
                <span className="ml-1 text-[10px] opacity-60">({table.max_covers})</span>
              </button>
            );
          })}
        </div>
      )}

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
                    const crmTags = Array.isArray(b.guest_tags) ? b.guest_tags : [];
                    const crmVisible = crmTags.slice(0, 3);
                    const crmMore = crmTags.length > 3 ? crmTags.length - 3 : 0;
                    const hasAllergy = tags.some((t) => t.isAllergy) || hasAllergyKeywords([b.dietary_notes, b.special_requests].filter(Boolean).join(' '));
                    const isExpanded = expandedId === b.id;
                    const isTerminalStatus = isTerminal(b.status);
                    const primaryAction = PRIMARY_ACTIONS[b.status];
                    const sStyle = STATUS_STYLE[b.status] ?? STATUS_STYLE.Pending!;
                    const isReturning = b.visit_count > 0;

                    return (
                      <li key={b.id} id={`booking-row-${b.id}`} className={`transition-colors ${isTerminalStatus ? 'bg-slate-50/50 opacity-70' : ''} ${hasAllergy ? 'border-l-4 border-l-red-400' : ''} ${highlightBookingId === b.id ? 'ring-2 ring-brand-400 ring-inset bg-brand-50/30' : ''}`}>
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
                            {bookingStatusDisplayLabel(b.status, isTableReservationBooking(b))}
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

                          {/* Table badge */}
                          {b.status === 'Seated' && b.table_assignments && b.table_assignments.length > 0 && (
                            <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-700 print:hidden">
                              {b.table_assignments.length === 1
                                ? `Table ${b.table_assignments[0]!.name}`
                                : `Tables ${b.table_assignments.map((t) => t.name).join(', ')}`}
                            </span>
                          )}

                          {/* Primary action */}
                          {primaryAction && !isTerminalStatus && (
                            <button
                              type="button"
                              disabled={actionLoading === b.id}
                              onClick={(e) => {
                                e.stopPropagation();
                                if (primaryAction.target === 'Completed') {
                                  setConfirmDialog({
                                    title: 'Complete Booking',
                                    message: `${b.guest_name} (${b.party_size}) at ${b.booking_time.slice(0, 5)} will be marked Completed.`,
                                    confirmLabel: 'Mark Completed',
                                    onConfirm: () => void changeStatus(b.id, primaryAction.target),
                                  });
                                  return;
                                }
                                if (primaryAction.target === 'Seated' && activeTables.length > 0) {
                                  e.stopPropagation();
                                  setSeatWithTableBookingId(b.id);
                                  setSeatSelectedTableIds([]);
                                  return;
                                }
                                void changeStatus(b.id, primaryAction.target);
                              }}
                              className={`rounded-lg px-3 py-1.5 text-xs font-semibold text-white shadow-sm disabled:opacity-50 print:hidden ${
                                primaryAction.target === 'Confirmed' ? 'bg-teal-600 hover:bg-teal-700' :
                                primaryAction.target === 'Seated' ? 'bg-brand-600 hover:bg-brand-700' :
                                'bg-slate-600 hover:bg-slate-700'
                              }`}
                            >
                              {actionLoading === b.id ? '...' : primaryAction.label}
                            </button>
                          )}
                          {!tableManagementEnabled && b.status === 'Seated' && activeTables.length > 0 && (
                            <button
                              type="button"
                              disabled={actionLoading === b.id}
                              onClick={(e) => {
                                e.stopPropagation();
                                setChangeTableBookingId(b.id);
                                setChangeTableSelectedIds((b.table_assignments ?? []).map((t) => t.id));
                              }}
                              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50 print:hidden"
                            >
                              Change table
                            </button>
                          )}

                          {/* Expand indicator */}
                          <span className="text-slate-300 print:hidden" aria-hidden="true">›</span>
                        </div>

                        {/* Dietary/special requests line */}
                        {(tags.length > 0 || b.special_requests || crmTags.length > 0) && (
                          <div className={`px-4 pb-2 space-y-1 ${isTerminalStatus ? 'opacity-60' : ''}`}>
                            {crmTags.length > 0 && (
                              <div className="flex flex-wrap items-center gap-1.5">
                                {crmVisible.map((tag, ti) => (
                                  <span
                                    key={`crm-${tag}-${ti}`}
                                    className="inline-flex items-center rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-semibold text-violet-800 ring-1 ring-violet-200"
                                  >
                                    {tag}
                                  </span>
                                ))}
                                {crmMore > 0 && (
                                  <span className="text-[10px] font-semibold text-violet-700">+{crmMore}</span>
                                )}
                              </div>
                            )}
                            {tags.length > 0 && (
                              <div className="flex flex-wrap items-center gap-1.5">
                                {tags.map((t) => (
                                  <span key={t.label} className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                                    t.isAllergy ? 'bg-red-100 text-red-800 ring-1 ring-red-200' : 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200'
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

                        {/* ── Expanded detail (layout aligned with dashboard/bookings concertina) ── */}
                        {isExpanded && (() => {
                          const guestName = b.guest_name || 'Guest';
                          const depositAmtStr = b.deposit_amount_pence ? `£${(b.deposit_amount_pence / 100).toFixed(2)}` : null;
                          const tableNames = (b.table_assignments ?? []).map((t) => t.name);
                          return (
                             
                            <div
                              className="border-t border-slate-100 bg-slate-50/40"
                              onClick={(e) => e.stopPropagation()}
                              onKeyDown={(e) => e.stopPropagation()}
                            >
                              <div className="space-y-3 px-2 py-3 sm:px-3 lg:px-1 lg:py-3">
                                <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
                                  {/* Guest card */}
                                  <div className="rounded-xl border border-slate-200 bg-white p-3.5">
                                    <div className="flex items-center gap-3">
                                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-100 text-sm font-bold text-brand-700">
                                        {guestName.charAt(0).toUpperCase()}
                                      </div>
                                      <div className="min-w-0 flex-1">
                                        <p className="truncate text-sm font-semibold text-slate-900">{guestName}</p>
                                        <p className="text-[11px] text-slate-500">
                                          {b.visit_count > 0 ? `${b.visit_count} visit${b.visit_count !== 1 ? 's' : ''}` : 'First visit'}
                                          {b.no_show_count > 0 && (
                                            <span className="ml-1 text-red-500">({b.no_show_count} no-show{b.no_show_count > 1 ? 's' : ''})</span>
                                          )}
                                        </p>
                                      </div>
                                    </div>
                                    <div className="mt-2.5 space-y-1">
                                      {b.guest_phone ? (
                                        <a href={`tel:${b.guest_phone}`} className="flex items-center gap-2 text-xs text-slate-600 hover:text-brand-600">
                                          <svg className="h-3.5 w-3.5 shrink-0 text-slate-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 0 0 2.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 0 1-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 0 0-1.091-.852H4.5A2.25 2.25 0 0 0 2.25 4.5v2.25Z" /></svg>
                                          {b.guest_phone}
                                        </a>
                                      ) : null}
                                      {b.guest_email ? (
                                        <a href={`mailto:${b.guest_email}`} className="flex items-center gap-2 text-xs text-slate-600 hover:text-brand-600">
                                          <svg className="h-3.5 w-3.5 shrink-0 text-slate-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" /></svg>
                                          <span className="truncate">{b.guest_email}</span>
                                        </a>
                                      ) : null}
                                      {!b.guest_phone && !b.guest_email && (
                                        <p className="text-xs italic text-slate-400">No contact details</p>
                                      )}
                                    </div>
                                  </div>

                                  {/* Booking summary */}
                                  <div className="rounded-xl border border-slate-200 bg-white p-3.5">
                                    <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                                      <div>
                                        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Date</p>
                                        <p className="text-sm font-medium text-slate-800">{formatDateNice(date)}</p>
                                      </div>
                                      <div>
                                        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Time</p>
                                        <p className="text-sm font-medium text-slate-800">
                                          {b.booking_time.slice(0, 5)}
                                          {b.estimated_end_time ? (
                                            <span className="text-slate-500"> – {b.estimated_end_time}</span>
                                          ) : null}
                                        </p>
                                      </div>
                                      <div>
                                        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Covers</p>
                                        <p className="text-sm font-medium text-slate-800">{b.party_size}</p>
                                      </div>
                                      <div>
                                        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Deposit</p>
                                        <p className={`text-sm font-medium ${b.deposit_status === 'Paid' ? 'text-emerald-700' : b.deposit_status === 'Pending' || b.deposit_status === 'Requested' || b.deposit_status === 'Unpaid' ? 'text-amber-700' : 'text-slate-500'}`}>
                                          {b.deposit_status === 'Paid' && depositAmtStr ? `${depositAmtStr} Paid` : b.deposit_status === 'Not Required' ? 'None' : b.deposit_status}
                                        </p>
                                      </div>
                                    </div>
                                    {(tableManagementEnabled || tableNames.length > 0) && (
                                      <div className="mt-2.5 border-t border-slate-100 pt-2">
                                        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Table</p>
                                        <p className={`text-sm font-medium ${tableNames.length > 0 ? 'text-slate-800' : 'text-amber-600'}`}>
                                          {tableNames.length > 0 ? tableNames.join(' + ') : 'Unassigned'}
                                        </p>
                                      </div>
                                    )}
                                    {b.occasion && (
                                      <div className="mt-2.5 border-t border-slate-100 pt-2">
                                        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Occasion</p>
                                        <p className="text-sm font-medium text-violet-900">{b.occasion}</p>
                                      </div>
                                    )}
                                    <div className="mt-2.5 border-t border-slate-100 pt-2 grid grid-cols-1 gap-2 sm:grid-cols-3 sm:gap-x-3">
                                      <div>
                                        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Source</p>
                                        <p className="text-sm font-medium text-slate-700">{b.source}</p>
                                      </div>
                                      <div>
                                        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Created</p>
                                        <p className="text-xs font-medium text-slate-600">{new Date(b.created_at).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })}</p>
                                      </div>
                                      <div>
                                        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Visit history</p>
                                        <p className="text-sm font-medium text-slate-700">
                                          {b.visit_count === 0 ? 'First visit' : `${ordinal(b.visit_count + 1)} visit`}
                                        </p>
                                      </div>
                                    </div>
                                    <div className="mt-2.5 border-t border-slate-100 pt-2">
                                      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Deposit actions</p>
                                      <DepositActions booking={b} onAction={() => void fetchDaySheet()} />
                                    </div>
                                  </div>

                                  <BookingNotesEditablePanel
                                    bookingId={b.id}
                                    dietaryNotes={b.dietary_notes}
                                    guestRequests={b.special_requests}
                                    staffNotes={b.internal_notes}
                                    onSaved={() => {
                                      void fetchDaySheet();
                                    }}
                                  />
                                </div>

                                {/* Actions bar - matches bookings concertina toolbar */}
                                <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50/60 px-3.5 py-2.5 print:hidden">
                                  <button type="button" onClick={() => setEditBooking(b)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50">
                                    Edit Booking
                                  </button>
                                  {!tableManagementEnabled && b.status === 'Seated' && activeTables.length > 0 && (
                                    <button
                                      type="button"
                                      disabled={actionLoading === b.id}
                                      onClick={() => {
                                        setChangeTableBookingId(b.id);
                                        setChangeTableSelectedIds((b.table_assignments ?? []).map((t) => t.id));
                                      }}
                                      className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                                    >
                                      Change table
                                    </button>
                                  )}
                                  <button type="button" onClick={() => setSendMessageId(b.id)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50">
                                    Send Message
                                  </button>
                                  {BOOKING_REVERT_ACTIONS[b.status as BookingStatus] && (
                                    <button
                                      type="button"
                                      disabled={actionLoading === b.id}
                                      onClick={() => {
                                        const ra = BOOKING_REVERT_ACTIONS[b.status as BookingStatus]!;
                                        setConfirmDialog({
                                          title: ra.label,
                                          message: `${b.guest_name} (${b.party_size}) at ${b.booking_time.slice(0, 5)} will be changed from ${bookingStatusDisplayLabel(b.status, isTableReservationBooking(b))} back to ${bookingStatusDisplayLabel(ra.target, isTableReservationBooking(b))}.`,
                                          confirmLabel: ra.label,
                                          onConfirm: () => void changeStatus(b.id, ra.target),
                                        });
                                      }}
                                      className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-100 disabled:opacity-50"
                                    >
                                      {BOOKING_REVERT_ACTIONS[b.status as BookingStatus]!.label}
                                    </button>
                                  )}
                                  {b.status === 'Confirmed' && (
                                    <button
                                      type="button"
                                      disabled={actionLoading === b.id || !canMarkNoShowForSlot(date, b.booking_time, data.no_show_grace_minutes)}
                                      title={!canMarkNoShowForSlot(date, b.booking_time, data.no_show_grace_minutes) ? `Available ${data.no_show_grace_minutes} min after booking time` : undefined}
                                      onClick={() => setConfirmDialog({
                                        title: 'Mark as No-Show',
                                        message: `${b.guest_name} (${b.party_size}) at ${b.booking_time.slice(0, 5)} will be marked No-Show.`,
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
                                        message: `${b.guest_name} (${b.party_size}) at ${b.booking_time.slice(0, 5)} will be cancelled. A cancellation message will be sent to the guest.`,
                                        confirmLabel: 'Cancel Booking',
                                        onConfirm: () => void changeStatus(b.id, 'Cancelled'),
                                      })}
                                      className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                                    >
                                      Cancel Booking
                                    </button>
                                  )}
                                </div>

                                <div className="rounded-xl border border-slate-200 bg-white p-3">
                                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Communications</p>
                                  {expandedComms == null ? (
                                    <p className="text-xs text-slate-400">Loading...</p>
                                  ) : expandedComms.length === 0 ? (
                                    <p className="text-xs text-slate-400">No messages sent</p>
                                  ) : (
                                    <ul className="max-h-32 space-y-1 overflow-y-auto pr-1">
                                      {expandedComms.map((c) => (
                                        <li key={c.id} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-600">
                                          <span className={`rounded px-1.5 py-0.5 font-medium ${c.channel === 'sms' ? 'bg-blue-50 text-blue-700' : 'bg-slate-50 text-slate-600'}`}>{c.channel.toUpperCase()}</span>
                                          <span>{c.message_type.replace(/_/g, ' ')}</span>
                                          <span className={c.status === 'sent' ? 'text-emerald-600' : 'text-red-500'}>{c.status}</span>
                                          <span className="text-slate-400">{new Date(c.created_at).toLocaleString()}</span>
                                        </li>
                                      ))}
                                    </ul>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })()}
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
        <DashboardStaffBookingModal
          open
          title="Walk-in"
          bookingIntent="walk-in"
          onClose={() => setShowWalkIn(false)}
          onCreated={() => {
            setShowWalkIn(false);
            addToast('Walk-in added', 'success');
            void fetchDaySheet();
          }}
          venueId={venueId}
          currency={currency ?? 'GBP'}
          bookingModel={bookingModel}
          enabledModels={enabledModels}
          advancedMode={tableManagementEnabled}
          initialDate={date}
          walkInRemainingCapacity={walkInCapacity}
        />
      )}
      {showNewBooking && (
        <DashboardStaffBookingModal
          open
          title="New booking"
          onClose={() => setShowNewBooking(false)}
          onCreated={() => {
            setShowNewBooking(false);
            void fetchDaySheet();
          }}
          venueId={venueId}
          currency={currency ?? 'GBP'}
          bookingModel={bookingModel}
          enabledModels={enabledModels}
          advancedMode={tableManagementEnabled}
          initialDate={date}
        />
      )}
      {editBooking && (
        <EditBookingModal
          booking={editBooking}
          date={date}
          venueId={venueId}
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
      {undoAction && (
        <UndoToast
          action={undoAction}
          onUndo={() => { void undoStatusChange(); }}
          onDismiss={() => setUndoAction(null)}
        />
      )}

      {/* ── Table Selector (Seat flow) ── */}
      {seatWithTableBookingId && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/20 p-4 backdrop-blur-sm"
          onClick={() => setSeatWithTableBookingId(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Assign table"
            className="my-16 w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="mb-4 text-lg font-semibold text-slate-900">Assign a table</h3>
            <TableSelector
              tables={activeTables}
              occupancyMap={occupancyMap}
              partySize={data?.periods.flatMap((p) => p.bookings).find((b) => b.id === seatWithTableBookingId)?.party_size ?? 2}
              selectedIds={seatSelectedTableIds}
              onChange={setSeatSelectedTableIds}
              confirmLabel="Seat"
              skipLabel="Seat without table"
              onConfirm={async (ids) => {
                const bookingId = seatWithTableBookingId;
                setSeatWithTableBookingId(null);
                setActionLoading(bookingId);
                try {
                  const res = await fetch(`/api/venue/bookings/${bookingId}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ status: 'Seated', table_ids: ids }),
                  });
                  if (!res.ok) {
                    const j = await res.json().catch(() => ({}));
                    addToast(j.error ?? 'Failed to seat guest', 'error');
                  } else {
                    addToast('Guest checked in', 'success');
                  }
                  void fetchDaySheet();
                } catch {
                  addToast('Failed to seat guest', 'error');
                } finally {
                  setActionLoading(null);
                }
              }}
              onSkip={() => {
                const bookingId = seatWithTableBookingId;
                setSeatWithTableBookingId(null);
                void changeStatus(bookingId, 'Seated');
              }}
            />
          </div>
        </div>
      )}

      {changeTableBookingId && data && (() => {
        const changeBooking = data.periods.flatMap((p) => p.bookings).find((x) => x.id === changeTableBookingId);
        if (!changeBooking) return null;
        return (
          <div
            className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/20 p-4 backdrop-blur-sm"
            onClick={() => setChangeTableBookingId(null)}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Change table"
              className="my-16 w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="mb-4 text-lg font-semibold text-slate-900">Change table</h3>
              <p className="mb-3 text-sm text-slate-600">
                Select table(s) for {changeBooking.guest_name}. Current booking tables are shown as free so you can move them.
              </p>
              <TableSelector
                tables={activeTables}
                occupancyMap={changeTableOccupancyMap}
                partySize={changeBooking.party_size}
                selectedIds={changeTableSelectedIds}
                onChange={setChangeTableSelectedIds}
                confirmLabel="Save"
                skipLabel="Cancel"
                onConfirm={async (ids) => {
                  const bookingId = changeTableBookingId;
                  if (!bookingId) return;
                  const oldIds = (changeBooking.table_assignments ?? []).map((t) => t.id);
                  setChangeTableBookingId(null);
                  setActionLoading(bookingId);
                  try {
                    const res = oldIds.length > 0
                      ? await fetch('/api/venue/tables/assignments', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            action: 'reassign',
                            booking_id: bookingId,
                            old_table_ids: oldIds,
                            new_table_ids: ids,
                          }),
                        })
                      : await fetch('/api/venue/tables/assignments', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ booking_id: bookingId, table_ids: ids }),
                        });
                    if (!res.ok) {
                      const j = await res.json().catch(() => ({}));
                      addToast((j as { error?: string }).error ?? 'Failed to update tables', 'error');
                    } else {
                      addToast('Table assignment updated', 'success');
                    }
                    void fetchDaySheet();
                  } catch {
                    addToast('Failed to update tables', 'error');
                  } finally {
                    setActionLoading(null);
                  }
                }}
                onSkip={() => setChangeTableBookingId(null)}
              />
            </div>
          </div>
        );
      })()}

      {/* ── Print Footer (print only) ── */}
      <div className="hidden print:block print:fixed print:bottom-0 print:left-0 print:right-0 print:border-t print:border-slate-200 print:py-2 print:px-6 print:text-xs print:text-slate-400 print:text-center">
        Printed {new Date().toLocaleString()} - ReserveNI
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
