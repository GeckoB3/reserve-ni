'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/browser';
import { BookingDetailPanel } from './BookingDetailPanel';
import { WalkInModal } from './WalkInModal';

interface BookingRow {
  id: string;
  booking_date: string;
  booking_time: string;
  party_size: number;
  status: string;
  source: string;
  deposit_status: string;
  deposit_amount_pence: number | null;
  dietary_notes: string | null;
  occasion: string | null;
  guest_name: string;
}

type ViewMode = 'day' | 'week' | 'month' | 'custom';
const STATUS_OPTIONS = ['All', 'Confirmed', 'Pending', 'Seated', 'Completed', 'Cancelled', 'No-Show'];

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDays(date: string, days: number): string {
  const d = new Date(date + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function startOfWeek(date: string): string {
  const d = new Date(date + 'T12:00:00');
  const day = d.getDay();
  const diff = day === 0 ? 6 : day - 1;
  d.setDate(d.getDate() - diff);
  return d.toISOString().slice(0, 10);
}

function endOfWeek(date: string): string {
  return addDays(startOfWeek(date), 6);
}

function startOfMonth(date: string): string {
  return date.slice(0, 7) + '-01';
}

function endOfMonth(date: string): string {
  const [y, m] = date.split('-').map(Number);
  const last = new Date(y!, m!, 0).getDate();
  return `${date.slice(0, 7)}-${String(last).padStart(2, '0')}`;
}

const WEEKDAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const WEEKDAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatDateLabel(date: string, mode: ViewMode): string {
  const d = new Date(date + 'T12:00:00');
  if (mode === 'day') {
    return `${WEEKDAYS_LONG[d.getDay()]} ${d.getDate()} ${MONTHS_LONG[d.getMonth()]} ${d.getFullYear()}`;
  }
  if (mode === 'week') {
    const end = new Date(endOfWeek(date) + 'T12:00:00');
    return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]} – ${end.getDate()} ${MONTHS_SHORT[end.getMonth()]} ${end.getFullYear()}`;
  }
  if (mode === 'month') return `${MONTHS_LONG[d.getMonth()]} ${d.getFullYear()}`;
  return '';
}

function formatDayHeader(date: string): string {
  const d = new Date(date + 'T12:00:00');
  return `${WEEKDAYS_SHORT[d.getDay()]} ${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
}

export function BookingsDashboard({ venueId }: { venueId: string }) {
  const [viewMode, setViewMode] = useState<ViewMode>('day');
  const [anchorDate, setAnchorDate] = useState(todayISO);
  const [customFrom, setCustomFrom] = useState(todayISO);
  const [customTo, setCustomTo] = useState(todayISO);
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [walkInOpen, setWalkInOpen] = useState(false);
  const [realtimeConnected, setRealtimeConnected] = useState<boolean | null>(null);

  const { from, to } = useMemo(() => {
    if (viewMode === 'day') return { from: anchorDate, to: anchorDate };
    if (viewMode === 'week') return { from: startOfWeek(anchorDate), to: endOfWeek(anchorDate) };
    if (viewMode === 'month') return { from: startOfMonth(anchorDate), to: endOfMonth(anchorDate) };
    return { from: customFrom, to: customTo };
  }, [viewMode, anchorDate, customFrom, customTo]);

  const fetchBookings = useCallback(async () => {
    setLoading(true);
    const params = viewMode === 'day'
      ? new URLSearchParams({ date: from })
      : new URLSearchParams({ from, to });
    if (statusFilter !== 'All') params.set('status', statusFilter);
    const res = await fetch(`/api/venue/bookings/list?${params}`);
    if (!res.ok) { setLoading(false); return; }
    const data = await res.json();
    setBookings(data.bookings ?? []);
    setLoading(false);
  }, [from, to, statusFilter, viewMode]);

  useEffect(() => { fetchBookings(); }, [fetchBookings]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel('bookings')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'bookings', filter: `venue_id=eq.${venueId}` },
        () => { fetchBookings(); }
      )
      .subscribe((status) => { setRealtimeConnected(status === 'SUBSCRIBED'); });
    return () => { supabase.removeChannel(channel); };
  }, [venueId, fetchBookings]);

  const handleWalkInCreated = useCallback(() => {
    setWalkInOpen(false);
    fetchBookings();
  }, [fetchBookings]);

  const navigate = (direction: -1 | 1) => {
    if (viewMode === 'day') setAnchorDate(addDays(anchorDate, direction));
    else if (viewMode === 'week') setAnchorDate(addDays(anchorDate, direction * 7));
    else if (viewMode === 'month') {
      const d = new Date(anchorDate + 'T12:00:00');
      d.setMonth(d.getMonth() + direction);
      setAnchorDate(d.toISOString().slice(0, 10));
    }
  };

  const goToToday = () => setAnchorDate(todayISO());

  const groupedByDate = useMemo(() => {
    if (viewMode === 'day') return null;
    const groups: Record<string, BookingRow[]> = {};
    for (const b of bookings) {
      (groups[b.booking_date] ??= []).push(b);
    }
    return groups;
  }, [bookings, viewMode]);

  const stats = useMemo(() => {
    const total = bookings.length;
    const totalCovers = bookings.reduce((sum, b) => sum + b.party_size, 0);
    const confirmed = bookings.filter(b => b.status === 'Confirmed' || b.status === 'Seated').length;
    const pending = bookings.filter(b => b.status === 'Pending').length;
    return { total, totalCovers, confirmed, pending };
  }, [bookings]);

  return (
    <div className="space-y-5">
      {realtimeConnected === false && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Updates may be delayed. Reconnecting&hellip;
        </div>
      )}

      {/* Top bar: view mode + navigation */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* View mode tabs */}
        <div className="flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
          {(['day', 'week', 'month', 'custom'] as ViewMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setViewMode(mode)}
              className={`rounded-lg px-4 py-2 text-sm font-medium capitalize transition-all ${
                viewMode === mode
                  ? 'bg-brand-600 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              {mode}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <button type="button" onClick={goToToday} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 shadow-sm">
            Today
          </button>
          <button type="button" onClick={() => setWalkInOpen(true)} className="flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-brand-700">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
            Walk-in
          </button>
        </div>
      </div>

      {/* Date navigation */}
      {viewMode !== 'custom' ? (
        <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
          <button type="button" onClick={() => navigate(-1)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-50 hover:text-slate-600">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" /></svg>
          </button>
          <div className="text-center">
            <h2 className="text-base font-semibold text-slate-900">{formatDateLabel(anchorDate, viewMode)}</h2>
            {anchorDate === todayISO() && <span className="text-xs font-medium text-brand-600">Today</span>}
          </div>
          <button type="button" onClick={() => navigate(1)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-50 hover:text-slate-600">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" /></svg>
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-slate-600">From</label>
            <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500" />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-slate-600">To</label>
            <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500" />
          </div>
        </div>
      )}

      {/* Summary stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Bookings" value={stats.total} color="brand" />
        <StatCard label="Total covers" value={stats.totalCovers} color="violet" />
        <StatCard label="Confirmed" value={stats.confirmed} color="emerald" />
        <StatCard label="Pending" value={stats.pending} color="amber" />
      </div>

      {/* Status filters */}
      <div className="flex flex-wrap gap-1.5">
        {STATUS_OPTIONS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatusFilter(s)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
              statusFilter === s
                ? 'bg-brand-600 text-white shadow-sm'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {/* Bookings table / grouped view */}
      {loading ? (
        <LoadingSkeleton />
      ) : bookings.length === 0 ? (
        <EmptyState />
      ) : viewMode === 'day' ? (
        <BookingsTable bookings={bookings} onSelect={setSelectedId} />
      ) : (
        <div className="space-y-4">
          {Object.entries(groupedByDate ?? {}).sort(([a], [b]) => a.localeCompare(b)).map(([date, dayBookings]) => (
            <div key={date} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/60 px-5 py-3">
                <h3 className="text-sm font-semibold text-slate-700">{formatDayHeader(date)}</h3>
                <div className="flex items-center gap-3 text-xs text-slate-500">
                  <span>{dayBookings.length} booking{dayBookings.length !== 1 ? 's' : ''}</span>
                  <span>{dayBookings.reduce((s, b) => s + b.party_size, 0)} covers</span>
                </div>
              </div>
              <BookingsTableBody bookings={dayBookings} onSelect={setSelectedId} />
            </div>
          ))}
        </div>
      )}

      {selectedId && (
        <BookingDetailPanel bookingId={selectedId} onClose={() => setSelectedId(null)} onUpdated={fetchBookings} />
      )}
      {walkInOpen && (
        <WalkInModal onClose={() => setWalkInOpen(false)} onCreated={handleWalkInCreated} />
      )}
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  const colors: Record<string, string> = {
    brand: 'bg-brand-50 text-brand-700 border-brand-100',
    violet: 'bg-violet-50 text-violet-700 border-violet-100',
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    amber: 'bg-amber-50 text-amber-700 border-amber-100',
  };
  return (
    <div className={`rounded-xl border px-4 py-3 ${colors[color] ?? 'bg-slate-50 text-slate-700 border-slate-200'}`}>
      <p className="text-2xl font-bold tabular-nums">{value}</p>
      <p className="text-xs font-medium opacity-75">{label}</p>
    </div>
  );
}

function statusBadge(s: string) {
  const map: Record<string, { dot: string; bg: string; text: string }> = {
    Confirmed: { dot: 'bg-emerald-500', bg: 'bg-emerald-50', text: 'text-emerald-700' },
    Pending: { dot: 'bg-amber-500', bg: 'bg-amber-50', text: 'text-amber-700' },
    Seated: { dot: 'bg-blue-500', bg: 'bg-blue-50', text: 'text-blue-700' },
    Completed: { dot: 'bg-slate-400', bg: 'bg-slate-50', text: 'text-slate-600' },
    Cancelled: { dot: 'bg-red-400', bg: 'bg-red-50', text: 'text-red-600' },
    'No-Show': { dot: 'bg-red-600', bg: 'bg-red-50', text: 'text-red-700' },
  };
  const style = map[s] ?? { dot: 'bg-slate-400', bg: 'bg-slate-50', text: 'text-slate-600' };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${style.bg} ${style.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
      {s}
    </span>
  );
}

function sourceBadge(s: string) {
  const map: Record<string, string> = {
    online: 'bg-violet-50 text-violet-700',
    phone: 'bg-sky-50 text-sky-700',
    'walk-in': 'bg-amber-50 text-amber-700',
    booking_page: 'bg-violet-50 text-violet-700',
  };
  return (
    <span className={`inline-block rounded-full px-2.5 py-1 text-xs font-medium ${map[s] ?? 'bg-slate-50 text-slate-600'}`}>
      {s === 'booking_page' ? 'online' : s}
    </span>
  );
}

function depositBadge(status: string, amountPence: number | null) {
  const amt = amountPence ? `£${(amountPence / 100).toFixed(2)}` : null;
  const map: Record<string, { bg: string; text: string; label: string }> = {
    Paid: { bg: 'bg-emerald-50', text: 'text-emerald-700', label: amt ? `${amt} Paid` : 'Paid' },
    Refunded: { bg: 'bg-blue-50', text: 'text-blue-700', label: amt ? `${amt} Refunded` : 'Refunded' },
    Pending: { bg: 'bg-amber-50', text: 'text-amber-700', label: 'Pending' },
    'Not Required': { bg: 'bg-slate-50', text: 'text-slate-500', label: '—' },
  };
  const style = map[status] ?? { bg: 'bg-slate-50', text: 'text-slate-500', label: status };
  return (
    <span className={`inline-block rounded-full px-2.5 py-1 text-xs font-medium ${style.bg} ${style.text}`}>
      {style.label}
    </span>
  );
}

function BookingsTable({ bookings, onSelect }: { bookings: BookingRow[]; onSelect: (id: string) => void }) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <BookingsTableBody bookings={bookings} onSelect={onSelect} />
    </div>
  );
}

function BookingsTableBody({ bookings, onSelect }: { bookings: BookingRow[]; onSelect: (id: string) => void }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead>
          <tr className="border-b border-slate-100 bg-slate-50/60">
            <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Time</th>
            <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Guest</th>
            <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Covers</th>
            <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Source</th>
            <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Status</th>
            <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Deposit</th>
            <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Notes</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {bookings.map((b) => (
            <tr key={b.id} onClick={() => onSelect(b.id)} className="cursor-pointer transition-colors hover:bg-brand-50/40">
              <td className="px-5 py-3.5 font-medium tabular-nums text-slate-900">{b.booking_time.length >= 5 ? b.booking_time.slice(0, 5) : b.booking_time}</td>
              <td className="px-5 py-3.5 font-medium text-slate-900">{b.guest_name}</td>
              <td className="px-5 py-3.5 text-slate-600">{b.party_size}</td>
              <td className="px-5 py-3.5">{sourceBadge(b.source)}</td>
              <td className="px-5 py-3.5">{statusBadge(b.status)}</td>
              <td className="px-5 py-3.5">{depositBadge(b.deposit_status, b.deposit_amount_pence)}</td>
              <td className="px-5 py-3.5">
                {[b.dietary_notes, b.occasion].filter(Boolean).length > 0 ? (
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-amber-100 text-xs text-amber-700" title={`Dietary: ${b.dietary_notes ?? '—'}\nOccasion: ${b.occasion ?? '—'}`}>!</span>
                ) : (
                  <span className="text-slate-300">&mdash;</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="divide-y divide-slate-100">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-5 py-4">
            <div className="h-4 w-12 animate-pulse rounded bg-slate-100" />
            <div className="h-4 w-28 animate-pulse rounded bg-slate-100" />
            <div className="h-4 w-8 animate-pulse rounded bg-slate-100" />
            <div className="h-5 w-16 animate-pulse rounded-full bg-slate-100" />
            <div className="h-5 w-20 animate-pulse rounded-full bg-slate-100" />
          </div>
        ))}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col items-center justify-center py-16 text-slate-400">
        <svg className="mb-3 h-10 w-10" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
        </svg>
        <p className="text-sm font-medium">No reservations for this period</p>
      </div>
    </div>
  );
}
