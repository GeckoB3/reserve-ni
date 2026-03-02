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
        {
          event: '*',
          schema: 'public',
          table: 'bookings',
          filter: `venue_id=eq.${venueId}`,
        },
        () => {
          fetchBookings();
        }
      )
      .subscribe((status) => {
        setRealtimeConnected(status === 'SUBSCRIBED');
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [venueId, fetchBookings]);

  const handleWalkInCreated = useCallback(() => {
    setWalkInOpen(false);
    fetchBookings();
  }, [fetchBookings]);

  const timeStr = (t: string) => (t.length >= 5 ? t.slice(0, 5) : t);

  const statusBadgeClass = (s: string) => {
    switch (s) {
      case 'Confirmed': return 'bg-green-100 text-green-800';
      case 'Pending': return 'bg-amber-100 text-amber-800';
      case 'Seated': return 'bg-blue-100 text-blue-800';
      case 'Completed': return 'bg-neutral-100 text-neutral-700';
      case 'Cancelled': return 'bg-red-100 text-red-800';
      case 'No-Show': return 'bg-red-200 text-red-900';
      default: return 'bg-neutral-100 text-neutral-700';
    }
  };

  const sourceBadgeClass = (s: string) => {
    switch (s) {
      case 'online': return 'bg-violet-100 text-violet-800';
      case 'phone': return 'bg-sky-100 text-sky-800';
      case 'walk-in': return 'bg-amber-100 text-amber-800';
      default: return 'bg-neutral-100 text-neutral-600';
    }
  };

  return (
    <div className="space-y-4">
      {realtimeConnected === false && (
        <div className="rounded border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-800">
          Updates may be delayed. Reconnecting…
        </div>
      )}

      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2">
          <span className="text-sm font-medium text-neutral-700">Date</span>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded border border-neutral-300 px-3 py-2 text-sm"
          />
        </label>
        <div className="flex flex-wrap gap-2">
          {STATUS_OPTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatusFilter(s)}
              className={`rounded-full px-3 py-1.5 text-sm font-medium ${statusFilter === s ? 'bg-neutral-900 text-white' : 'bg-white border border-neutral-300 text-neutral-700 hover:bg-neutral-50'}`}
            >
              {s}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setWalkInOpen(true)}
          className="ml-auto rounded bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
        >
          Add Walk-in
        </button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white shadow-sm">
        {loading ? (
          <div className="p-8 text-center text-neutral-500">Loading…</div>
        ) : bookings.length === 0 ? (
          <div className="p-8 text-center text-neutral-500">No bookings for this date.</div>
        ) : (
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-neutral-200 bg-neutral-50">
                <th className="px-4 py-3 font-medium text-neutral-700">Time</th>
                <th className="px-4 py-3 font-medium text-neutral-700">Guest</th>
                <th className="px-4 py-3 font-medium text-neutral-700">Party</th>
                <th className="px-4 py-3 font-medium text-neutral-700">Source</th>
                <th className="px-4 py-3 font-medium text-neutral-700">Status</th>
                <th className="px-4 py-3 font-medium text-neutral-700">Deposit</th>
                <th className="px-4 py-3 font-medium text-neutral-700">Dietary / Occasion</th>
              </tr>
            </thead>
            <tbody>
              {bookings.map((b) => (
                <tr
                  key={b.id}
                  onClick={() => setSelectedId(b.id)}
                  className="cursor-pointer border-b border-neutral-100 hover:bg-neutral-50"
                >
                  <td className="px-4 py-3 font-medium">{timeStr(b.booking_time)}</td>
                  <td className="px-4 py-3">{b.guest_name}</td>
                  <td className="px-4 py-3">{b.party_size}</td>
                  <td className="px-4 py-3">
                    <span className={`inline rounded px-2 py-0.5 text-xs font-medium ${sourceBadgeClass(b.source)}`}>
                      {b.source}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline rounded px-2 py-0.5 text-xs font-medium ${statusBadgeClass(b.status)}`}>
                      {b.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {b.deposit_status === 'Paid' && b.deposit_amount_pence
                      ? `£${(b.deposit_amount_pence / 100).toFixed(2)}`
                      : b.deposit_status}
                  </td>
                  <td className="px-4 py-3">
                    {[b.dietary_notes, b.occasion].filter(Boolean).length > 0 ? (
                      <span className="text-amber-600" title={`Dietary: ${b.dietary_notes ?? '—'}\nOccasion: ${b.occasion ?? '—'}`}>
                        ⋆
                      </span>
                    ) : (
                      '—'
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
