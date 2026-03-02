'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/browser';
import { parseDietaryNotes } from '@/lib/day-sheet';

interface DaySheetBooking {
  id: string;
  booking_time: string;
  party_size: number;
  status: string;
  source: string;
  deposit_status: string;
  dietary_notes: string | null;
  occasion: string | null;
  guest_name: string;
}

interface DaySheetGroup {
  key: string;
  label: string;
  bookings: DaySheetBooking[];
}

interface DaySheetData {
  date: string;
  periodKey: string | null;
  periodLabel: string | null;
  periodEndsAt: string | null;
  groups: DaySheetGroup[];
  summary: { coversExpected: number; seated: number; noShows: number; cancellations: number };
  dietarySummary: Array<{ label: string; count: number }>;
}

type ConnectionStatus = 'green' | 'amber' | 'red';

const POLL_INTERVAL_MS = 30_000;
const ADVANCE_CHECK_MS = 45_000;

function statusColor(s: string): string {
  switch (s) {
    case 'Confirmed': return 'bg-blue-100 text-blue-800 border-blue-200';
    case 'Seated': return 'bg-green-100 text-green-800 border-green-200';
    case 'No-Show': return 'bg-red-100 text-red-800 border-red-200';
    case 'Completed': return 'bg-neutral-100 text-neutral-600 border-neutral-200';
    case 'Cancelled': return 'bg-neutral-100 text-neutral-500 border-neutral-200';
    case 'Pending': return 'bg-amber-100 text-amber-800 border-amber-200';
    default: return 'bg-neutral-100 text-neutral-600 border-neutral-200';
  }
}

/** True if current time (local) is at least 15 minutes after booking time. */
function canMarkNoShow(bookingTime: string): boolean {
  const [h, m] = bookingTime.split(':').map(Number);
  const bookingMin = (h ?? 0) * 60 + (m ?? 0);
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  return nowMin >= bookingMin + 15;
}

export function DaySheetView({ venueId }: { venueId: string }) {
  const [data, setData] = useState<DaySheetData | null>(null);
  const [loading, setLoading] = useState(true);
  const [connection, setConnection] = useState<ConnectionStatus>('amber');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [actioning, setActioning] = useState(false);
  const [dietaryOpen, setDietaryOpen] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const advanceRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchDaySheet = useCallback(async (): Promise<boolean> => {
    try {
      const res = await fetch('/api/venue/day-sheet');
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
  }, []);

  useEffect(() => {
    fetchDaySheet();
  }, [fetchDaySheet]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel('day-sheet-bookings')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'bookings', filter: `venue_id=eq.${venueId}` },
        () => { fetchDaySheet(); }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setConnection('green');
          if (pollRef.current) {
            clearInterval(pollRef.current);
            pollRef.current = null;
          }
        } else {
          setConnection('amber');
        }
      });
    return () => {
      supabase.removeChannel(channel);
      if (pollRef.current) clearInterval(pollRef.current);
      if (advanceRef.current) clearInterval(advanceRef.current);
    };
  }, [venueId, fetchDaySheet]);

  useEffect(() => {
    if (connection === 'amber' && !pollRef.current) {
      pollRef.current = setInterval(() => {
        fetchDaySheet().then((ok) => {
          if (!ok) setConnection('red');
        });
      }, POLL_INTERVAL_MS);
    }
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [connection, fetchDaySheet]);

  useEffect(() => {
    advanceRef.current = setInterval(() => fetchDaySheet(), ADVANCE_CHECK_MS);
    return () => {
      if (advanceRef.current) {
        clearInterval(advanceRef.current);
        advanceRef.current = null;
      }
    };
  }, [fetchDaySheet]);

  const setStatus = useCallback(async (bookingId: string, status: 'Seated' | 'No-Show') => {
    setActioning(true);
    try {
      const res = await fetch(`/api/venue/bookings/${bookingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        setSelectedId(null);
        await fetchDaySheet();
      }
    } finally {
      setActioning(false);
    }
  }, [fetchDaySheet]);

  if (loading && !data) {
    return <div className="rounded-lg bg-white p-8 text-center text-neutral-500">Loading…</div>;
  }

  if (!data) {
    return (
      <div className="rounded-lg bg-white p-8 text-center">
        <p className="text-neutral-600">Unable to load day sheet.</p>
        <button type="button" onClick={() => fetchDaySheet()} className="mt-2 text-blue-600 underline">Retry</button>
      </div>
    );
  }

  const selectedBooking = selectedId
    ? data.groups.flatMap((g) => g.bookings).find((b) => b.id === selectedId)
    : null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`inline-block h-3 w-3 rounded-full ${
            connection === 'green' ? 'bg-green-500' : connection === 'amber' ? 'bg-amber-500' : 'bg-red-500'
          }`}
          title={connection === 'green' ? 'Live' : connection === 'amber' ? 'Updates every 30s' : 'Offline'}
        />
        <span className="text-xs text-neutral-600">
          {connection === 'green' ? 'Live' : connection === 'amber' ? 'Updates may be delayed' : 'Offline — data may not be current'}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="rounded-lg bg-white p-3 shadow-sm">
          <div className="text-xs font-medium text-neutral-500">Covers expected</div>
          <div className="text-2xl font-bold text-neutral-900">{data.summary.coversExpected}</div>
        </div>
        <div className="rounded-lg bg-white p-3 shadow-sm">
          <div className="text-xs font-medium text-neutral-500">Seated</div>
          <div className="text-2xl font-bold text-green-700">{data.summary.seated}</div>
        </div>
        <div className="rounded-lg bg-white p-3 shadow-sm">
          <div className="text-xs font-medium text-neutral-500">No-shows</div>
          <div className="text-2xl font-bold text-red-700">{data.summary.noShows}</div>
        </div>
        <div className="rounded-lg bg-white p-3 shadow-sm">
          <div className="text-xs font-medium text-neutral-500">Cancelled</div>
          <div className="text-2xl font-bold text-neutral-500">{data.summary.cancellations}</div>
        </div>
      </div>

      <div className="rounded-lg border border-neutral-200 bg-white">
        <button
          type="button"
          onClick={() => setDietaryOpen((o) => !o)}
          className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium text-neutral-800"
        >
          Dietary summary
          <span className="text-neutral-400">{dietaryOpen ? '▼' : '▶'}</span>
        </button>
        {dietaryOpen && (
          <div className="border-t border-neutral-100 px-4 py-3 text-sm text-neutral-600">
            {data.dietarySummary.length === 0 ? (
              <span className="text-neutral-400">None noted</span>
            ) : (
              <ul className="flex flex-wrap gap-x-4 gap-y-1">
                {data.dietarySummary.map(({ label, count }) => (
                  <li key={label}>{count}× {label}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      <div className="rounded-lg bg-white p-3 shadow-sm">
        <h2 className="text-sm font-semibold text-neutral-700">
          {data.periodLabel ?? 'Today'} — {data.date}
        </h2>
      </div>

      {data.groups.length === 0 ? (
        <div className="rounded-lg bg-white p-8 text-center text-neutral-500">No bookings in this period.</div>
      ) : (
        <div className="space-y-4">
          {data.groups.map((group) => (
            <div key={group.key} className="rounded-lg bg-white shadow-sm">
              <div className="border-b border-neutral-100 px-3 py-2 text-sm font-medium text-neutral-600">
                {group.label}
              </div>
              <ul className="divide-y divide-neutral-100">
                {group.bookings.map((b) => {
                  const tags = parseDietaryNotes(b.dietary_notes, b.occasion);
                  const isSelected = selectedId === b.id;
                  const canNoShow = canMarkNoShow(b.booking_time);
                  return (
                    <li key={b.id} className="flex flex-col">
                      <button
                        type="button"
                        onClick={() => setSelectedId(isSelected ? null : b.id)}
                        className="flex w-full items-center gap-2 px-3 py-3 text-left hover:bg-neutral-50"
                      >
                        <span className="flex-1 truncate font-medium text-neutral-900">{b.guest_name}</span>
                        <span className="text-2xl font-bold tabular-nums text-neutral-900">{b.party_size}</span>
                        <span className={`rounded border px-2 py-0.5 text-xs font-medium ${statusColor(b.status)}`}>
                          {b.status}
                        </span>
                        <span className="flex gap-0.5 text-lg">
                          {tags.map((t) => (
                            <span key={t.label} title={t.label}>{t.icon}</span>
                          ))}
                        </span>
                      </button>
                      {isSelected && (b.status === 'Confirmed' || b.status === 'Seated') && (
                        <div className="flex gap-2 border-t border-neutral-100 bg-neutral-50 px-3 py-3">
                          {b.status === 'Confirmed' && (
                            <button
                              type="button"
                              disabled={actioning}
                              onClick={() => setStatus(b.id, 'Seated')}
                              className="min-h-[48px] flex-1 rounded-lg bg-green-600 px-4 py-3 text-lg font-semibold text-white hover:bg-green-700 disabled:opacity-50"
                            >
                              Check In
                            </button>
                          )}
                          {b.status === 'Confirmed' && (
                            <button
                              type="button"
                              disabled={actioning || !canNoShow}
                              title={!canNoShow ? 'Available 15 minutes after booking time' : undefined}
                              onClick={() => setStatus(b.id, 'No-Show')}
                              className="min-h-[48px] flex-1 rounded-lg bg-red-600 px-4 py-3 text-lg font-semibold text-white hover:bg-red-700 disabled:opacity-50 disabled:bg-red-300"
                            >
                              No-Show
                            </button>
                          )}
                          {b.status === 'Seated' && (
                            <button
                              type="button"
                              disabled={actioning || !canNoShow}
                              title={!canNoShow ? 'Available 15 minutes after booking time' : undefined}
                              onClick={() => setStatus(b.id, 'No-Show')}
                              className="min-h-[48px] flex-1 rounded-lg bg-red-600 px-4 py-3 text-lg font-semibold text-white hover:bg-red-700 disabled:opacity-50 disabled:bg-red-300"
                            >
                              No-Show
                            </button>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
