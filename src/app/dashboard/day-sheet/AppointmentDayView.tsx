'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppointmentBookingForm } from '@/components/booking/AppointmentBookingForm';
import { AppointmentWalkInModal } from '@/components/booking/AppointmentWalkInModal';

interface Practitioner {
  id: string;
  name: string;
  is_active: boolean;
}

interface AppointmentService {
  id: string;
  name: string;
  duration_minutes: number;
  colour: string;
  price_pence: number | null;
}

interface Booking {
  id: string;
  booking_date: string;
  booking_time: string;
  booking_end_time: string | null;
  party_size: number;
  status: string;
  source: string;
  practitioner_id: string | null;
  appointment_service_id: string | null;
  guest_name: string;
  guest_email: string | null;
  guest_phone: string | null;
  estimated_end_time: string | null;
}

const STATUS_ORDER: Record<string, number> = {
  Pending: 1,
  Confirmed: 2,
  Seated: 3,
  Completed: 4,
  'No-Show': 5,
  Cancelled: 6,
};

const STATUS_STYLES: Record<string, string> = {
  Pending: 'bg-amber-100 text-amber-800',
  Confirmed: 'bg-blue-100 text-blue-800',
  Seated: 'bg-purple-100 text-purple-800',
  Completed: 'bg-green-100 text-green-800',
  'No-Show': 'bg-red-100 text-red-800',
  Cancelled: 'bg-slate-100 text-slate-500',
};

const STATUS_LABELS: Record<string, string> = {
  Pending: 'Pending',
  Confirmed: 'Confirmed',
  Seated: 'In Progress',
  Completed: 'Completed',
  'No-Show': 'No Show',
  Cancelled: 'Cancelled',
};

function timeToMinutes(t: string): number {
  const [hh, mm] = t.slice(0, 5).split(':').map(Number);
  return (hh ?? 0) * 60 + (mm ?? 0);
}

function minutesToTime(m: number): string {
  const hh = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

export function AppointmentDayView({ venueId, currency = 'GBP' }: { venueId: string; currency?: string }) {
  const [date, setDate] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  });
  const [practitioners, setPractitioners] = useState<Practitioner[]>([]);
  const [services, setServices] = useState<AppointmentService[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [showBookingForm, setShowBookingForm] = useState(false);
  const [showWalkIn, setShowWalkIn] = useState(false);
  const [statusUpdating, setStatusUpdating] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [pracRes, bookRes, svcRes] = await Promise.all([
        fetch('/api/venue/practitioners'),
        fetch(`/api/venue/bookings/list?date=${date}`),
        fetch('/api/venue/appointment-services'),
      ]);
      if (!pracRes.ok || !bookRes.ok || !svcRes.ok) {
        setError('Failed to load appointment data. Please refresh the page.');
        return;
      }
      const [pracData, bookData, svcData] = await Promise.all([
        pracRes.json(), bookRes.json(), svcRes.json(),
      ]);
      setPractitioners(pracData.practitioners ?? []);
      setBookings((bookData.bookings ?? []).filter((b: Booking) => b.practitioner_id));
      setServices(svcData.services ?? []);
    } catch {
      setError('Failed to load appointment data. Please check your connection.');
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const serviceMap = useMemo(() => new Map(services.map((s) => [s.id, s])), [services]);
  const practitionerMap = useMemo(() => new Map(practitioners.filter((p) => p.is_active).map((p) => [p.id, p])), [practitioners]);

  const sortedBookings = useMemo(() => {
    return [...bookings].sort((a, b) => {
      const timeA = timeToMinutes(a.booking_time);
      const timeB = timeToMinutes(b.booking_time);
      if (timeA !== timeB) return timeA - timeB;
      return (STATUS_ORDER[a.status] ?? 0) - (STATUS_ORDER[b.status] ?? 0);
    });
  }, [bookings]);

  const activeBookings = useMemo(
    () => sortedBookings.filter((b) => !['Cancelled', 'No-Show'].includes(b.status)),
    [sortedBookings],
  );

  const completedCount = bookings.filter((b) => b.status === 'Completed').length;
  const upcomingCount = bookings.filter((b) => ['Pending', 'Confirmed'].includes(b.status)).length;

  function goToday() {
    const now = new Date();
    setDate(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`);
  }

  function prevDay() {
    const d = new Date(date + 'T12:00:00');
    d.setDate(d.getDate() - 1);
    setDate(d.toISOString().slice(0, 10));
  }

  function nextDay() {
    const d = new Date(date + 'T12:00:00');
    d.setDate(d.getDate() + 1);
    setDate(d.toISOString().slice(0, 10));
  }

  async function updateStatus(bookingId: string, newStatus: string) {
    setStatusUpdating(bookingId);
    setError(null);
    try {
      const res = await fetch(`/api/venue/bookings/${bookingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        await fetchData();
      } else {
        const data = await res.json().catch(() => ({ error: 'Unknown error' }));
        setError(data.error ?? 'Failed to update status');
      }
    } catch {
      setError('Failed to update status. Please try again.');
    } finally {
      setStatusUpdating(null);
    }
  }

  function getBookingDuration(b: Booking): number {
    if (b.booking_end_time) return timeToMinutes(b.booking_end_time) - timeToMinutes(b.booking_time);
    if (b.appointment_service_id) {
      const svc = serviceMap.get(b.appointment_service_id);
      if (svc) return svc.duration_minutes;
    }
    return 30;
  }

  const dateLabel = new Date(date + 'T12:00:00').toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  const isToday = (() => {
    const now = new Date();
    return date === `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  })();

  return (
    <div>
      {/* Header */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 sm:text-2xl">Today&apos;s Appointments</h1>
          <p className="text-sm text-slate-500">{dateLabel}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={prevDay} className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm hover:bg-slate-50">&larr;</button>
          <button onClick={goToday} className={`rounded-lg border px-3 py-1.5 text-sm font-medium ${isToday ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-300 hover:bg-slate-50'}`}>Today</button>
          <button onClick={nextDay} className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm hover:bg-slate-50">&rarr;</button>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-2 text-red-400 hover:text-red-600">&times;</button>
        </div>
      )}

      {/* Stats */}
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="text-xs text-slate-500">Total</div>
          <div className="text-2xl font-bold text-slate-900">{activeBookings.length}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="text-xs text-slate-500">Upcoming</div>
          <div className="text-2xl font-bold text-blue-600">{upcomingCount}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="text-xs text-slate-500">Completed</div>
          <div className="text-2xl font-bold text-green-600">{completedCount}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="text-xs text-slate-500">No Shows</div>
          <div className="text-2xl font-bold text-red-600">{bookings.filter((b) => b.status === 'No-Show').length}</div>
        </div>
      </div>

      {/* Action buttons */}
      <div className="mb-4 flex gap-2">
        <button
          onClick={() => setShowBookingForm(true)}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          New Appointment
        </button>
        <button
          onClick={() => setShowWalkIn(true)}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Walk-in
        </button>
      </div>

      {/* Appointments list */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-xl bg-slate-100" />
          ))}
        </div>
      ) : sortedBookings.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-12 text-center">
          <p className="mb-2 text-slate-500">No appointments for this day.</p>
          <button
            onClick={() => setShowBookingForm(true)}
            className="text-sm font-medium text-blue-600 hover:underline"
          >
            Create an appointment
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {sortedBookings.map((b) => {
            const svc = b.appointment_service_id ? serviceMap.get(b.appointment_service_id) : null;
            const prac = b.practitioner_id ? practitionerMap.get(b.practitioner_id) : null;
            const duration = getBookingDuration(b);
            const endTime = minutesToTime(timeToMinutes(b.booking_time) + duration);
            const isCancelled = ['Cancelled', 'No-Show'].includes(b.status);

            return (
              <div
                key={b.id}
                className={`rounded-xl border bg-white px-4 py-3 shadow-sm transition-colors ${isCancelled ? 'opacity-50' : ''}`}
                style={{ borderLeftWidth: 4, borderLeftColor: svc?.colour ?? '#94a3b8' }}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-slate-900">{b.guest_name}</span>
                      <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[b.status] ?? 'bg-slate-100 text-slate-600'}`}>
                        {STATUS_LABELS[b.status] ?? b.status}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-slate-500">
                      <span className="font-medium text-slate-700">{b.booking_time.slice(0, 5)} - {endTime}</span>
                      {svc && <span>{svc.name}</span>}
                      {prac && <span>with {prac.name}</span>}
                      <span>{duration} mins</span>
                    </div>
                    {b.guest_phone && (
                      <div className="mt-0.5 text-xs text-slate-400">{b.guest_phone}</div>
                    )}
                  </div>

                  {/* Quick actions */}
                  {!isCancelled && (
                    <div className="flex flex-shrink-0 items-center gap-1">
                      {b.status === 'Pending' && (
                        <button
                          onClick={() => updateStatus(b.id, 'Confirmed')}
                          disabled={statusUpdating === b.id}
                          className="rounded-lg bg-blue-100 px-2.5 py-1 text-xs font-medium text-blue-700 hover:bg-blue-200 disabled:opacity-50"
                        >
                          Confirm
                        </button>
                      )}
                      {b.status === 'Confirmed' && (
                        <button
                          onClick={() => updateStatus(b.id, 'Seated')}
                          disabled={statusUpdating === b.id}
                          className="rounded-lg bg-purple-100 px-2.5 py-1 text-xs font-medium text-purple-700 hover:bg-purple-200 disabled:opacity-50"
                        >
                          Start
                        </button>
                      )}
                      {b.status === 'Seated' && (
                        <button
                          onClick={() => updateStatus(b.id, 'Completed')}
                          disabled={statusUpdating === b.id}
                          className="rounded-lg bg-green-100 px-2.5 py-1 text-xs font-medium text-green-700 hover:bg-green-200 disabled:opacity-50"
                        >
                          Done
                        </button>
                      )}
                      {b.status === 'Confirmed' && (
                        <button
                          onClick={() => updateStatus(b.id, 'No-Show')}
                          disabled={statusUpdating === b.id}
                          className="rounded-lg px-2 py-1 text-xs text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                        >
                          No Show
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modals */}
      <AppointmentBookingForm
        open={showBookingForm}
        onClose={() => setShowBookingForm(false)}
        onCreated={fetchData}
        venueId={venueId}
        currency={currency}
        preselectedDate={date}
      />
      <AppointmentWalkInModal
        open={showWalkIn}
        onClose={() => setShowWalkIn(false)}
        onCreated={fetchData}
        currency={currency}
      />
    </div>
  );
}
