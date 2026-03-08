'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/browser';
import { parseDietaryNotes } from '@/lib/day-sheet';

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDays(date: string, days: number): string {
  const d = new Date(date + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function formatDateLabel(date: string): string {
  const d = new Date(date + 'T12:00:00');
  return `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

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

function statusStyle(s: string): { dot: string; bg: string; text: string } {
  const map: Record<string, { dot: string; bg: string; text: string }> = {
    Confirmed: { dot: 'bg-emerald-500', bg: 'bg-emerald-50', text: 'text-emerald-700' },
    Seated: { dot: 'bg-blue-500', bg: 'bg-blue-50', text: 'text-blue-700' },
    'No-Show': { dot: 'bg-red-600', bg: 'bg-red-50', text: 'text-red-700' },
    Completed: { dot: 'bg-slate-400', bg: 'bg-slate-50', text: 'text-slate-600' },
    Cancelled: { dot: 'bg-slate-300', bg: 'bg-slate-50', text: 'text-slate-500' },
    Pending: { dot: 'bg-amber-500', bg: 'bg-amber-50', text: 'text-amber-700' },
  };
  return map[s] ?? { dot: 'bg-slate-400', bg: 'bg-slate-50', text: 'text-slate-600' };
}

function canMarkNoShow(bookingTime: string): boolean {
  const [h, m] = bookingTime.split(':').map(Number);
  const bookingMin = (h ?? 0) * 60 + (m ?? 0);
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  return nowMin >= bookingMin + 15;
}

export function DaySheetView({ venueId }: { venueId: string }) {
  const [date, setDate] = useState(todayISO);
  const [data, setData] = useState<DaySheetData | null>(null);
  const [loading, setLoading] = useState(true);
  const [connection, setConnection] = useState<ConnectionStatus>('amber');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [actioning, setActioning] = useState(false);
  const [dietaryOpen, setDietaryOpen] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const advanceRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isToday = useMemo(() => date === todayISO(), [date]);

  const fetchDaySheet = useCallback(async (): Promise<boolean> => {
    try {
      const params = new URLSearchParams({ date });
      const res = await fetch(`/api/venue/day-sheet?${params}`);
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

  useEffect(() => { fetchDaySheet(); }, [fetchDaySheet]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel('day-sheet-bookings')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings', filter: `venue_id=eq.${venueId}` }, () => { fetchDaySheet(); })
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
      if (advanceRef.current) clearInterval(advanceRef.current);
    };
  }, [venueId, fetchDaySheet]);

  useEffect(() => {
    if (connection === 'amber' && !pollRef.current) {
      pollRef.current = setInterval(() => {
        fetchDaySheet().then((ok) => { if (!ok) setConnection('red'); });
      }, POLL_INTERVAL_MS);
    }
    return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
  }, [connection, fetchDaySheet]);

  useEffect(() => {
    advanceRef.current = setInterval(() => fetchDaySheet(), ADVANCE_CHECK_MS);
    return () => { if (advanceRef.current) { clearInterval(advanceRef.current); advanceRef.current = null; } };
  }, [fetchDaySheet]);

  const setStatus = useCallback(async (bookingId: string, status: 'Seated' | 'No-Show') => {
    setActioning(true);
    try {
      const res = await fetch(`/api/venue/bookings/${bookingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (res.ok) { setSelectedId(null); await fetchDaySheet(); }
    } finally { setActioning(false); }
  }, [fetchDaySheet]);

  if (loading && !data) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-2 h-3 w-16 animate-pulse rounded bg-slate-100" />
              <div className="h-7 w-12 animate-pulse rounded bg-slate-100" />
            </div>
          ))}
        </div>
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-16 animate-pulse rounded-xl bg-white shadow-sm" />
        ))}
      </div>
    );
  }

  if (!data) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-12 text-center">
        <p className="text-slate-500">Unable to load day sheet.</p>
        <button type="button" onClick={() => fetchDaySheet()} className="mt-3 text-sm font-medium text-brand-600 hover:text-brand-700">Retry</button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Date navigation */}
      <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <button type="button" onClick={() => { setLoading(true); setDate(addDays(date, -1)); }} className="rounded-lg p-2 text-slate-400 hover:bg-slate-50 hover:text-slate-600">
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" /></svg>
        </button>
        <div className="text-center">
          <h2 className="text-base font-semibold text-slate-900">{formatDateLabel(date)}</h2>
          {isToday && <span className="text-xs font-medium text-brand-600">Today</span>}
        </div>
        <div className="flex items-center gap-1">
          {!isToday && (
            <button type="button" onClick={() => { setLoading(true); setDate(todayISO()); }} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">
              Today
            </button>
          )}
          <button type="button" onClick={() => { setLoading(true); setDate(addDays(date, 1)); }} className="rounded-lg p-2 text-slate-400 hover:bg-slate-50 hover:text-slate-600">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" /></svg>
          </button>
        </div>
      </div>

      {/* Connection status */}
      <div className="flex items-center gap-2">
        <span className={`inline-block h-2.5 w-2.5 rounded-full ${
          connection === 'green' ? 'bg-emerald-500' : connection === 'amber' ? 'bg-amber-400' : 'bg-red-500'
        }`} />
        <span className="text-xs text-slate-500">
          {connection === 'green' ? 'Live updates' : connection === 'amber' ? 'Polling every 30s' : 'Offline'}
        </span>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryCard label="Expected" value={data.summary.coversExpected} accent="teal" />
        <SummaryCard label="Seated" value={data.summary.seated} accent="emerald" />
        <SummaryCard label="No-shows" value={data.summary.noShows} accent="red" />
        <SummaryCard label="Cancelled" value={data.summary.cancellations} accent="slate" />
      </div>

      {/* Dietary summary */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <button
          type="button"
          onClick={() => setDietaryOpen((o) => !o)}
          className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium text-slate-700"
        >
          <span className="flex items-center gap-2">
            <svg className="h-4 w-4 text-amber-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
            </svg>
            Dietary &amp; Allergy Notes
          </span>
          <svg className={`h-4 w-4 text-slate-400 transition-transform ${dietaryOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
          </svg>
        </button>
        {dietaryOpen && (
          <div className="border-t border-slate-100 px-4 py-3">
            {data.dietarySummary.length === 0 ? (
              <p className="text-sm text-slate-400">No dietary notes for today</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {data.dietarySummary.map(({ label, count }) => (
                  <span key={label} className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-sm font-medium text-amber-800">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-200 text-xs font-bold text-amber-900">{count}</span>
                    {label}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Period heading */}
      {data.periodLabel && (
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold text-slate-800">{data.periodLabel}</h2>
        </div>
      )}

      {/* Booking groups */}
      {data.groups.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-slate-200 bg-white py-16 text-slate-400">
          <svg className="mb-3 h-10 w-10" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
          </svg>
          <p className="text-sm font-medium">No bookings in this period</p>
        </div>
      ) : (
        <div className="space-y-4">
          {data.groups.map((group) => (
            <div key={group.key} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="sticky top-0 z-10 border-b border-slate-100 bg-slate-50/80 backdrop-blur px-4 py-2.5">
                <span className="text-sm font-semibold text-slate-600">{group.label}</span>
                <span className="ml-2 text-xs text-slate-400">{group.bookings.length} booking{group.bookings.length !== 1 ? 's' : ''}</span>
              </div>
              <ul className="divide-y divide-slate-50">
                {group.bookings.map((b) => {
                  const tags = parseDietaryNotes(b.dietary_notes, b.occasion);
                  const isSelected = selectedId === b.id;
                  const canNoShow = canMarkNoShow(b.booking_time);
                  const sStyle = statusStyle(b.status);
                  return (
                    <li key={b.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(isSelected ? null : b.id)}
                        className={`flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors min-h-[56px] ${isSelected ? 'bg-brand-50/50' : 'hover:bg-slate-50'}`}
                      >
                        <span className="flex-1 truncate font-medium text-slate-900">{b.guest_name}</span>
                        <span className="text-xl font-bold tabular-nums text-slate-900">{b.party_size}</span>
                        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${sStyle.bg} ${sStyle.text}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${sStyle.dot}`} />
                          {b.status}
                        </span>
                        {tags.length > 0 && (
                          <div className="flex gap-1">
                            {tags.map((t) => (
                              <span key={t.label} className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800" title={t.label}>
                                {t.icon} {t.label}
                              </span>
                            ))}
                          </div>
                        )}
                      </button>
                      {isSelected && (b.status === 'Confirmed' || b.status === 'Seated') && (
                        <div className="flex gap-3 border-t border-slate-100 bg-slate-50/50 px-4 py-3">
                          {b.status === 'Confirmed' && (
                            <button
                              type="button"
                              disabled={actioning}
                              onClick={() => setStatus(b.id, 'Seated')}
                              className="min-h-[52px] flex-1 rounded-xl bg-brand-600 px-4 py-3 text-base font-semibold text-white shadow-sm hover:bg-brand-700 disabled:opacity-50"
                            >
                              Check In
                            </button>
                          )}
                          {(b.status === 'Confirmed' || b.status === 'Seated') && (
                            <button
                              type="button"
                              disabled={actioning || !canNoShow}
                              title={!canNoShow ? 'Available 15 minutes after booking time' : undefined}
                              onClick={() => setStatus(b.id, 'No-Show')}
                              className="min-h-[52px] flex-1 rounded-xl bg-red-600 px-4 py-3 text-base font-semibold text-white shadow-sm hover:bg-red-700 disabled:opacity-50 disabled:bg-red-300"
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

function SummaryCard({ label, value, accent }: { label: string; value: number; accent: string }) {
  const accentMap: Record<string, { border: string; text: string }> = {
    teal: { border: 'border-brand-200', text: 'text-brand-700' },
    emerald: { border: 'border-emerald-200', text: 'text-emerald-700' },
    red: { border: 'border-red-200', text: 'text-red-700' },
    slate: { border: 'border-slate-200', text: 'text-slate-500' },
  };
  const a = accentMap[accent] ?? accentMap.slate;
  return (
    <div className={`rounded-xl border bg-white p-4 shadow-sm ${a.border}`}>
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${a.text}`}>{value}</p>
    </div>
  );
}
