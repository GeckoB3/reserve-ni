'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

// ─── Types ──────────────────────────────────────────────────────────────────
interface Practitioner {
  id: string;
  name: string;
  is_active: boolean;
  colour?: string;
}

interface AppointmentService {
  id: string;
  name: string;
  duration_minutes: number;
  colour: string;
}

interface Booking {
  id: string;
  booking_date: string;
  booking_time: string;
  booking_end_time: string | null;
  party_size: number;
  status: string;
  practitioner_id: string | null;
  appointment_service_id: string | null;
  guest_name: string;
  guest_email: string | null;
  guest_phone: string | null;
  estimated_end_time: string | null;
}

interface PractitionerServiceLink {
  practitioner_id: string;
  service_id: string;
}

// ─── Constants ──────────────────────────────────────────────────────────────
const SLOT_HEIGHT = 48;
const SLOT_MINUTES = 15;
const DAY_START_HOUR = 7;
const DAY_END_HOUR = 21;
const TOTAL_SLOTS = ((DAY_END_HOUR - DAY_START_HOUR) * 60) / SLOT_MINUTES;

const STATUS_COLOURS: Record<string, { bg: string; text: string; border: string }> = {
  Pending: { bg: 'bg-amber-50', text: 'text-amber-800', border: 'border-amber-200' },
  Confirmed: { bg: 'bg-blue-50', text: 'text-blue-800', border: 'border-blue-200' },
  Seated: { bg: 'bg-purple-50', text: 'text-purple-800', border: 'border-purple-200' },
  Completed: { bg: 'bg-green-50', text: 'text-green-800', border: 'border-green-200' },
  'No-Show': { bg: 'bg-red-50', text: 'text-red-800', border: 'border-red-200' },
  Cancelled: { bg: 'bg-slate-100', text: 'text-slate-500', border: 'border-slate-200' },
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

function formatDateLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

function slotTop(time: string): number {
  const mins = timeToMinutes(time);
  const offset = mins - DAY_START_HOUR * 60;
  return (offset / SLOT_MINUTES) * SLOT_HEIGHT;
}

function slotHeightFromDuration(durationMins: number): number {
  return (durationMins / SLOT_MINUTES) * SLOT_HEIGHT;
}

// ─── Component ──────────────────────────────────────────────────────────────
export function PractitionerCalendarView({
  venueId,
  currency = 'GBP',
}: {
  venueId: string;
  currency?: string;
}) {
  const [date, setDate] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  });
  const [practitioners, setPractitioners] = useState<Practitioner[]>([]);
  const [services, setServices] = useState<AppointmentService[]>([]);
  const [pLinks, setPLinks] = useState<PractitionerServiceLink[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [filterPractitioner, setFilterPractitioner] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [fetchError, setFetchError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const [pracRes, bookRes, svcRes] = await Promise.all([
        fetch('/api/venue/practitioners'),
        fetch(`/api/venue/bookings/list?date=${date}`),
        fetch('/api/venue/appointment-services'),
      ]);
      if (!pracRes.ok || !bookRes.ok || !svcRes.ok) {
        setFetchError('Failed to load calendar data. Please refresh the page.');
        return;
      }
      const [pracData, bookData, svcData] = await Promise.all([
        pracRes.json(), bookRes.json(), svcRes.json(),
      ]);
      setPractitioners(pracData.practitioners ?? []);
      setBookings((bookData.bookings ?? []).filter((b: Booking) => b.practitioner_id));
      setServices(svcData.services ?? []);
      setPLinks(svcData.practitioner_services ?? []);
    } catch {
      setFetchError('Failed to load calendar data. Please check your connection.');
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Scroll to 8am on load
  useEffect(() => {
    if (!loading && scrollRef.current) {
      const eightAm = ((8 - DAY_START_HOUR) * 60 / SLOT_MINUTES) * SLOT_HEIGHT;
      scrollRef.current.scrollTop = eightAm;
    }
  }, [loading]);

  const activePractitioners = useMemo(
    () => practitioners.filter((p) => p.is_active),
    [practitioners],
  );

  const filteredPractitioners = useMemo(
    () =>
      filterPractitioner === 'all'
        ? activePractitioners
        : activePractitioners.filter((p) => p.id === filterPractitioner),
    [activePractitioners, filterPractitioner],
  );

  const serviceMap = useMemo(() => new Map(services.map((s) => [s.id, s])), [services]);

  function bookingsForPractitioner(pracId: string): Booking[] {
    return bookings.filter((b) => {
      if (b.practitioner_id !== pracId) return false;
      if (filterStatus !== 'all' && b.status !== filterStatus) return false;
      return true;
    });
  }

  function getBookingDuration(b: Booking): number {
    if (b.booking_end_time) {
      return timeToMinutes(b.booking_end_time) - timeToMinutes(b.booking_time);
    }
    if (b.appointment_service_id) {
      const svc = serviceMap.get(b.appointment_service_id);
      if (svc) return svc.duration_minutes;
    }
    return 30;
  }

  function getBookingColour(b: Booking): string {
    if (b.appointment_service_id) {
      const svc = serviceMap.get(b.appointment_service_id);
      if (svc?.colour) return svc.colour;
    }
    return '#3B82F6';
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

  function goToday() {
    const now = new Date();
    setDate(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`);
  }

  async function updateBookingStatus(bookingId: string, newStatus: string) {
    setStatusUpdating(true);
    setStatusError(null);
    try {
      const res = await fetch(`/api/venue/bookings/${bookingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Unknown error' }));
        setStatusError(data.error ?? 'Failed to update status');
        return;
      }
      setSelectedBooking(null);
      await fetchData();
    } catch {
      setStatusError('Failed to update status. Please try again.');
    } finally {
      setStatusUpdating(false);
    }
  }

  // Summary stats
  const todayBookings = bookings.filter((b) => !['Cancelled', 'No-Show'].includes(b.status));
  const confirmedCount = bookings.filter((b) => b.status === 'Confirmed').length;
  const completedCount = bookings.filter((b) => b.status === 'Completed').length;

  const timeLabels = Array.from({ length: TOTAL_SLOTS + 1 }, (_, i) => {
    const mins = DAY_START_HOUR * 60 + i * SLOT_MINUTES;
    return minutesToTime(mins);
  });

  return (
    <div className="flex flex-col h-[calc(100dvh-72px)] md:h-[calc(100dvh-100px)] lg:h-[calc(100dvh-120px)]">
      {/* Header */}
      <div className="flex-shrink-0 space-y-3 pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-xl font-semibold text-slate-900 sm:text-2xl">Calendar</h1>
          <div className="flex items-center gap-2">
            <button onClick={prevDay} className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm hover:bg-slate-50">&larr;</button>
            <button onClick={goToday} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium hover:bg-slate-50">Today</button>
            <button onClick={nextDay} className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm hover:bg-slate-50">&rarr;</button>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
            />
          </div>
        </div>

        <div className="text-sm text-slate-500">{formatDateLabel(date)}</div>

        {/* Filters + Stats */}
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={filterPractitioner}
            onChange={(e) => setFilterPractitioner(e.target.value)}
            className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
          >
            <option value="all">All team members</option>
            {activePractitioners.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
          >
            <option value="all">All statuses</option>
            <option value="Pending">Pending</option>
            <option value="Confirmed">Confirmed</option>
            <option value="Seated">In Progress</option>
            <option value="Completed">Completed</option>
            <option value="No-Show">No Show</option>
            <option value="Cancelled">Cancelled</option>
          </select>

          <div className="ml-auto flex items-center gap-4 text-sm">
            <span className="text-slate-500"><span className="font-semibold text-slate-900">{todayBookings.length}</span> appointments</span>
            <span className="hidden sm:inline text-slate-500"><span className="font-semibold text-blue-600">{confirmedCount}</span> confirmed</span>
            <span className="hidden sm:inline text-slate-500"><span className="font-semibold text-green-600">{completedCount}</span> completed</span>
          </div>
        </div>
      </div>

      {/* Error banners */}
      {fetchError && (
        <div className="mb-3 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 flex items-center justify-between">
          <span>{fetchError}</span>
          <button onClick={() => setFetchError(null)} className="ml-2 text-red-400 hover:text-red-600">&times;</button>
        </div>
      )}

      {/* Calendar grid */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
        </div>
      ) : filteredPractitioners.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="rounded-xl border border-slate-200 bg-white p-12 text-center">
            <p className="text-slate-500">No team members configured yet. Add them in Availability settings.</p>
          </div>
        </div>
      ) : (
        <div ref={scrollRef} className="flex-1 overflow-auto border rounded-xl border-slate-200 bg-white">
          <div className="flex min-w-[600px]">
            {/* Time column */}
            <div className="w-16 flex-shrink-0 border-r border-slate-100 bg-slate-50">
              <div className="h-10 border-b border-slate-100" />
              <div className="relative" style={{ height: TOTAL_SLOTS * SLOT_HEIGHT }}>
                {timeLabels.map((t, i) =>
                  i % 4 === 0 ? (
                    <div
                      key={t}
                      className="absolute left-0 w-full pr-2 text-right text-xs text-slate-400"
                      style={{ top: i * SLOT_HEIGHT - 6 }}
                    >
                      {t}
                    </div>
                  ) : null,
                )}
              </div>
            </div>

            {/* Practitioner columns */}
            {filteredPractitioners.map((prac) => {
              const pracBookings = bookingsForPractitioner(prac.id);
              return (
                <div key={prac.id} className="flex-1 min-w-[180px] border-r border-slate-100 last:border-r-0">
                  {/* Header */}
                  <div className="sticky top-0 z-10 bg-white border-b border-slate-100 px-3 py-2 h-10 flex items-center justify-center">
                    <span className="text-sm font-semibold text-slate-900 truncate text-center">{prac.name}</span>
                  </div>

                  {/* Time grid */}
                  <div className="relative" style={{ height: TOTAL_SLOTS * SLOT_HEIGHT }}>
                    {/* Grid lines */}
                    {timeLabels.map((_, i) => (
                      <div
                        key={i}
                        className={`absolute left-0 w-full border-t ${i % 4 === 0 ? 'border-slate-100' : 'border-slate-50'}`}
                        style={{ top: i * SLOT_HEIGHT }}
                      />
                    ))}

                    {/* Booking blocks */}
                    {pracBookings.map((b) => {
                      const duration = getBookingDuration(b);
                      const colour = getBookingColour(b);
                      const statusStyle = STATUS_COLOURS[b.status] ?? STATUS_COLOURS.Confirmed;
                      const svc = b.appointment_service_id ? serviceMap.get(b.appointment_service_id) : null;
                      const top = slotTop(b.booking_time);
                      const height = Math.max(slotHeightFromDuration(duration), SLOT_HEIGHT * 0.75);

                      return (
                        <button
                          key={b.id}
                          onClick={() => setSelectedBooking(b)}
                          className={`absolute left-1 right-1 rounded-lg border px-2 py-1 text-left transition-shadow hover:shadow-md cursor-pointer overflow-hidden ${statusStyle.bg} ${statusStyle.border}`}
                          style={{ top, height, borderLeftWidth: 3, borderLeftColor: colour }}
                        >
                          <div className={`text-xs font-semibold truncate ${statusStyle.text}`}>
                            {b.guest_name}
                          </div>
                          {svc && height > 36 && (
                            <div className="text-[10px] text-slate-500 truncate">{svc.name}</div>
                          )}
                          {height > 52 && (
                            <div className="text-[10px] text-slate-400">
                              {b.booking_time.slice(0, 5)} - {minutesToTime(timeToMinutes(b.booking_time) + duration)}
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Booking detail sheet */}
      {selectedBooking && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40" onClick={() => setSelectedBooking(null)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="booking-detail-title"
            className="w-full max-w-md rounded-t-2xl sm:rounded-2xl bg-white p-6 shadow-xl max-h-[80vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 id="booking-detail-title" className="text-lg font-semibold text-slate-900">{selectedBooking.guest_name}</h2>
                {selectedBooking.guest_phone && (
                  <p className="text-sm text-slate-500">{selectedBooking.guest_phone}</p>
                )}
                {selectedBooking.guest_email && (
                  <p className="text-sm text-slate-500">{selectedBooking.guest_email}</p>
                )}
              </div>
              <button onClick={() => setSelectedBooking(null)} aria-label="Close" className="rounded-lg p-1 hover:bg-slate-100">
                <svg className="h-5 w-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M6 18L18 6M6 6l12 12"/></svg>
              </button>
            </div>

            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">Service</span>
                <span className="font-medium text-slate-900">
                  {selectedBooking.appointment_service_id
                    ? serviceMap.get(selectedBooking.appointment_service_id)?.name ?? 'Unknown'
                    : 'N/A'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Team member</span>
                <span className="font-medium text-slate-900">
                  {practitioners.find((p) => p.id === selectedBooking.practitioner_id)?.name ?? 'Unknown'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Time</span>
                <span className="font-medium text-slate-900">
                  {selectedBooking.booking_time.slice(0, 5)} - {minutesToTime(timeToMinutes(selectedBooking.booking_time) + getBookingDuration(selectedBooking))}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Duration</span>
                <span className="font-medium text-slate-900">{getBookingDuration(selectedBooking)} mins</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Status</span>
                <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                  (STATUS_COLOURS[selectedBooking.status] ?? STATUS_COLOURS.Confirmed).bg
                } ${(STATUS_COLOURS[selectedBooking.status] ?? STATUS_COLOURS.Confirmed).text}`}>
                  {STATUS_LABELS[selectedBooking.status] ?? selectedBooking.status}
                </span>
              </div>
            </div>

            {/* Status actions - uses valid DB statuses and transition rules */}
            <div className="mt-5 space-y-2">
              {statusError && (
                <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
                  {statusError}
                </div>
              )}
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Quick Actions</p>
              <div className="flex flex-wrap gap-2">
                {selectedBooking.status === 'Pending' && (
                  <button
                    onClick={() => updateBookingStatus(selectedBooking.id, 'Confirmed')}
                    disabled={statusUpdating}
                    className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    Confirm
                  </button>
                )}
                {selectedBooking.status === 'Confirmed' && (
                  <button
                    onClick={() => updateBookingStatus(selectedBooking.id, 'Seated')}
                    disabled={statusUpdating}
                    className="rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-purple-700 disabled:opacity-50"
                  >
                    Start Appointment
                  </button>
                )}
                {selectedBooking.status === 'Seated' && (
                  <button
                    onClick={() => updateBookingStatus(selectedBooking.id, 'Completed')}
                    disabled={statusUpdating}
                    className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
                  >
                    Complete
                  </button>
                )}
                {selectedBooking.status === 'Confirmed' && (
                  <button
                    onClick={() => updateBookingStatus(selectedBooking.id, 'No-Show')}
                    disabled={statusUpdating}
                    className="rounded-lg bg-red-100 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-200 disabled:opacity-50"
                  >
                    No Show
                  </button>
                )}
                {['Pending', 'Confirmed', 'Seated'].includes(selectedBooking.status) && (
                  <button
                    onClick={() => updateBookingStatus(selectedBooking.id, 'Cancelled')}
                    disabled={statusUpdating}
                    className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-200 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
