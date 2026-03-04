'use client';

import { useCallback, useEffect, useState } from 'react';
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

const STATUS_OPTIONS = ['All', 'Confirmed', 'Pending', 'Seated', 'Completed', 'Cancelled', 'No-Show'];

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function BookingsDashboard({ venueId }: { venueId: string }) {
  const [date, setDate] = useState(todayISO);
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [walkInOpen, setWalkInOpen] = useState(false);
  const [realtimeConnected, setRealtimeConnected] = useState<boolean | null>(null);

  const fetchBookings = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ date });
    if (statusFilter !== 'All') params.set('status', statusFilter);
    const res = await fetch(`/api/venue/bookings/list?${params}`);
    if (!res.ok) return;
    const data = await res.json();
    setBookings(data.bookings ?? []);
    setLoading(false);
  }, [date, statusFilter]);

  useEffect(() => {
    fetchBookings();
  }, [fetchBookings]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel('bookings')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'bookings', filter: `venue_id=eq.${venueId}` },
        () => { fetchBookings(); }
      )
      .subscribe((status) => {
        setRealtimeConnected(status === 'SUBSCRIBED');
      });
    return () => { supabase.removeChannel(channel); };
  }, [venueId, fetchBookings]);

  const handleWalkInCreated = useCallback(() => {
    setWalkInOpen(false);
    fetchBookings();
  }, [fetchBookings]);

  const timeStr = (t: string) => (t.length >= 5 ? t.slice(0, 5) : t);

  const statusBadge = (s: string) => {
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
  };

  const sourceBadge = (s: string) => {
    const map: Record<string, string> = {
      online: 'bg-violet-50 text-violet-700',
      phone: 'bg-sky-50 text-sky-700',
      'walk-in': 'bg-amber-50 text-amber-700',
    };
    return (
      <span className={`inline-block rounded-full px-2.5 py-1 text-xs font-medium ${map[s] ?? 'bg-slate-50 text-slate-600'}`}>
        {s}
      </span>
    );
  };

  return (
    <div className="space-y-5">
      {realtimeConnected === false && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Updates may be delayed. Reconnecting&hellip;
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
          <svg className="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
          </svg>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="border-0 bg-transparent text-sm font-medium text-slate-700 focus:outline-none"
          />
        </div>

        <div className="flex flex-wrap gap-1.5">
          {STATUS_OPTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatusFilter(s)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                statusFilter === s
                  ? 'bg-teal-600 text-white shadow-sm'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
              }`}
            >
              {s}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setWalkInOpen(true)}
          className="ml-auto flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-teal-700"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Walk-in
        </button>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <div className="space-y-0 divide-y divide-slate-100">
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
        ) : bookings.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400">
            <svg className="mb-3 h-10 w-10" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
            </svg>
            <p className="text-sm font-medium">No reservations for this date</p>
          </div>
        ) : (
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
                <tr
                  key={b.id}
                  onClick={() => setSelectedId(b.id)}
                  className="cursor-pointer transition-colors hover:bg-teal-50/40"
                >
                  <td className="px-5 py-3.5 font-medium tabular-nums text-slate-900">{timeStr(b.booking_time)}</td>
                  <td className="px-5 py-3.5 font-medium text-slate-900">{b.guest_name}</td>
                  <td className="px-5 py-3.5 text-slate-600">{b.party_size}</td>
                  <td className="px-5 py-3.5">{sourceBadge(b.source)}</td>
                  <td className="px-5 py-3.5">{statusBadge(b.status)}</td>
                  <td className="px-5 py-3.5 text-slate-600">
                    {b.deposit_status === 'Paid' && b.deposit_amount_pence
                      ? `£${(b.deposit_amount_pence / 100).toFixed(2)}`
                      : b.deposit_status}
                  </td>
                  <td className="px-5 py-3.5">
                    {[b.dietary_notes, b.occasion].filter(Boolean).length > 0 ? (
                      <span
                        className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-amber-100 text-xs text-amber-700"
                        title={`Dietary: ${b.dietary_notes ?? '—'}\nOccasion: ${b.occasion ?? '—'}`}
                      >!</span>
                    ) : (
                      <span className="text-slate-300">&mdash;</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {selectedId && (
        <BookingDetailPanel
          bookingId={selectedId}
          onClose={() => setSelectedId(null)}
          onUpdated={fetchBookings}
        />
      )}

      {walkInOpen && (
        <WalkInModal onClose={() => setWalkInOpen(false)} onCreated={handleWalkInCreated} />
      )}
    </div>
  );
}
