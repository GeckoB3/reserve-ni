'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { getCalendarGridBounds } from '@/lib/venue-calendar-bounds';
import type { OpeningHours } from '@/types/availability';
import {
  AppointmentDetailSheet,
  type AppointmentDetailPrefetch,
} from '@/components/booking/AppointmentDetailSheet';
import type { ClassPaymentRequirement } from '@/types/booking-models';
import { showAttendanceConfirmedPill, showDepositPendingPill } from '@/lib/booking/booking-staff-indicators';
import { NumericInput } from '@/components/ui/NumericInput';

const SLOT_HEIGHT = 48;
const SLOT_MINUTES = 15;
/** Guard against pathological opening_hours producing huge slot arrays. */
const MAX_TIME_SLOTS = 384;

const STATUS_COLOURS: Record<string, { bg: string; text: string; border: string }> = {
  Pending: { bg: 'bg-orange-50', text: 'text-orange-900', border: 'border-orange-200' },
  Confirmed: { bg: 'bg-blue-50', text: 'text-blue-800', border: 'border-blue-200' },
  Seated: { bg: 'bg-violet-50', text: 'text-violet-900', border: 'border-violet-200' },
  Completed: { bg: 'bg-emerald-50', text: 'text-emerald-900', border: 'border-emerald-200' },
  'No-Show': { bg: 'bg-red-50', text: 'text-red-800', border: 'border-red-200' },
  Cancelled: { bg: 'bg-slate-100', text: 'text-slate-500', border: 'border-slate-200' },
};

function timeToMinutes(t: string): number {
  const [hh, mm] = t.slice(0, 5).split(':').map(Number);
  return (hh ?? 0) * 60 + (mm ?? 0);
}

function minutesToTime(m: number): string {
  const hh = Math.floor(m / 60) % 24;
  const mm = m % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

interface VenueResource {
  id: string;
  name: string;
  min_booking_minutes: number;
  max_booking_minutes: number;
  slot_interval_minutes: number;
  sort_order: number;
  is_active: boolean;
  price_per_slot_pence: number | null;
}

interface ResourceBookingRow {
  id: string;
  booking_date: string;
  booking_time: string;
  booking_end_time: string | null;
  estimated_end_time: string | null;
  party_size: number;
  status: string;
  resource_id: string | null;
  guest_name: string;
  guest_email: string | null;
  guest_phone: string | null;
  guest_visit_count: number | null;
  special_requests: string | null;
  internal_notes: string | null;
  client_arrived_at: string | null;
  guest_attendance_confirmed_at?: string | null;
  staff_attendance_confirmed_at?: string | null;
  deposit_amount_pence: number | null;
  deposit_status: string;
  resource_payment_requirement?: string | null;
}

interface AvailSlot {
  start_time: string;
}

function resourceBookingToPrefetch(b: ResourceBookingRow): AppointmentDetailPrefetch {
  return {
    id: b.id,
    booking_date: b.booking_date,
    booking_time: b.booking_time,
    booking_end_time: b.booking_end_time,
    status: b.status,
    practitioner_id: null,
    appointment_service_id: null,
    special_requests: b.special_requests,
    internal_notes: b.internal_notes,
    client_arrived_at: b.client_arrived_at,
    guest_attendance_confirmed_at: b.guest_attendance_confirmed_at ?? null,
    staff_attendance_confirmed_at: b.staff_attendance_confirmed_at ?? null,
    deposit_amount_pence: b.deposit_amount_pence,
    deposit_status: b.deposit_status,
    resource_payment_requirement: (b.resource_payment_requirement as ClassPaymentRequirement | null) ?? null,
    party_size: b.party_size,
    guest_name: b.guest_name,
    guest_email: b.guest_email,
    guest_phone: b.guest_phone,
    guest_visit_count: b.guest_visit_count,
  };
}

function bookingDurationMins(b: ResourceBookingRow): number {
  if (b.booking_end_time) {
    return Math.max(SLOT_MINUTES, timeToMinutes(b.booking_end_time) - timeToMinutes(b.booking_time));
  }
  if (b.estimated_end_time) {
    try {
      const d = new Date(b.estimated_end_time);
      if (!Number.isNaN(d.getTime())) {
        const start = new Date(`${b.booking_date}T${b.booking_time.slice(0, 5)}:00`);
        const mins = Math.round((d.getTime() - start.getTime()) / 60000);
        if (mins > 0) return mins;
      }
    } catch {
      /* fall through */
    }
  }
  return 60;
}

export function ResourceCalendarGrid({
  venueId: _venueId,
  date,
  currency = 'GBP',
  onDateChange,
  compactToolbar = false,
}: {
  venueId: string;
  date: string;
  currency?: string;
  onDateChange?: (next: string) => void;
  /** Hide date navigation when embedded in PractitionerCalendarView */
  compactToolbar?: boolean;
}) {
  const [openingHours, setOpeningHours] = useState<OpeningHours | null>(null);
  const [venueTimezone, setVenueTimezone] = useState<string>('Europe/London');
  const [resources, setResources] = useState<VenueResource[]>([]);
  const [bookings, setBookings] = useState<ResourceBookingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detailBookingId, setDetailBookingId] = useState<string | null>(null);
  const [showAvailability, setShowAvailability] = useState(false);
  const [availabilityDuration, setAvailabilityDuration] = useState(60);
  const [availSlots, setAvailSlots] = useState<Record<string, AvailSlot[]>>({});
  const scrollRef = useRef<HTMLDivElement>(null);
  const timelineRootRef = useRef<HTMLDivElement>(null);

  const bounds = useMemo(
    () => getCalendarGridBounds(date, openingHours ?? undefined, 7, 21, { timeZone: venueTimezone }),
    [date, openingHours, venueTimezone],
  );

  const startHour = Number.isFinite(bounds.startHour) ? bounds.startHour : 7;
  const endHour = Number.isFinite(bounds.endHour) ? bounds.endHour : 21;

  const TOTAL_SLOTS = useMemo(() => {
    const span = endHour - startHour;
    if (!Number.isFinite(span) || span <= 0) {
      return Math.min(Math.floor((14 * 60) / SLOT_MINUTES), MAX_TIME_SLOTS);
    }
    const n = Math.floor((span * 60) / SLOT_MINUTES);
    return Math.min(Math.max(n, 1), MAX_TIME_SLOTS);
  }, [endHour, startHour]);

  const timeLabels = useMemo(
    () =>
      Array.from({ length: TOTAL_SLOTS + 1 }, (_, i) => {
        const mins = startHour * 60 + i * SLOT_MINUTES;
        return minutesToTime(mins);
      }),
    [TOTAL_SLOTS, startHour],
  );

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [venueRes, resRes, bookRes] = await Promise.all([
        fetch('/api/venue'),
        fetch('/api/venue/resources'),
        fetch(`/api/venue/bookings/list?date=${date}`),
      ]);
      if (!venueRes.ok || !resRes.ok || !bookRes.ok) {
        setError('Failed to load resource calendar.');
        return;
      }
      const [venueJson, resJson, bookJson] = await Promise.all([
        venueRes.json(),
        resRes.json(),
        bookRes.json(),
      ]);
      if (venueJson?.opening_hours) setOpeningHours(venueJson.opening_hours as OpeningHours);
      const tz = (venueJson as { timezone?: string | null }).timezone;
      if (typeof tz === 'string' && tz.trim() !== '') setVenueTimezone(tz.trim());
      const raw = (resJson.resources ?? []) as VenueResource[];
      setResources(raw.filter((r) => r.is_active).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)));
      const rows = (bookJson.bookings ?? []) as ResourceBookingRow[];
      setBookings(rows.filter((b) => b.resource_id));
    } catch {
      setError('Failed to load resource calendar.');
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  const fetchAvailability = useCallback(async () => {
    if (!showAvailability) return;
    try {
      const res = await fetch(`/api/venue/resource-availability?date=${date}&duration=${availabilityDuration}`);
      const data = await res.json();
      if (!res.ok) return;
      const map: Record<string, AvailSlot[]> = {};
      for (const r of data.resources ?? []) {
        map[r.id] = (r.slots ?? []).map((s: { start_time: string }) => ({ start_time: s.start_time }));
      }
      setAvailSlots(map);
    } catch {
      setAvailSlots({});
    }
  }, [date, showAvailability, availabilityDuration]);

  useEffect(() => {
    void fetchAvailability();
  }, [fetchAvailability]);

  function slotTop(time: string): number {
    const mins = timeToMinutes(time);
    const offset = mins - startHour * 60;
    return (offset / SLOT_MINUTES) * SLOT_HEIGHT;
  }

  function slotHeightFromDuration(durationMins: number): number {
    return Math.max((durationMins / SLOT_MINUTES) * SLOT_HEIGHT, SLOT_HEIGHT * 0.75);
  }

  function bookingsForResource(resourceId: string): ResourceBookingRow[] {
    return bookings.filter((b) => b.resource_id === resourceId && b.booking_date === date);
  }

  const detailPrefetch = useMemo((): AppointmentDetailPrefetch | null => {
    if (!detailBookingId) return null;
    const b = bookings.find((x) => x.id === detailBookingId);
    return b ? resourceBookingToPrefetch(b) : null;
  }, [detailBookingId, bookings]);

  useEffect(() => {
    if (loading) return;
    const el = scrollRef.current;
    const main = el?.closest('main');
    if (!el || !main) return;
    const eightAm = ((8 - startHour) * 60) / SLOT_MINUTES;
    const yOffset = Math.max(0, eightAm * SLOT_HEIGHT);
    const apply = () => {
      const m = scrollRef.current?.closest('main');
      const node = scrollRef.current;
      if (!m || !node) return;
      const mainRect = m.getBoundingClientRect();
      const elRect = node.getBoundingClientRect();
      const elDocTop = m.scrollTop + (elRect.top - mainRect.top);
      m.scrollTo({ top: Math.max(0, elDocTop + yOffset) });
    };
    const id = requestAnimationFrame(() => requestAnimationFrame(apply));
    return () => cancelAnimationFrame(id);
  }, [loading, startHour, date]);

  useEffect(() => {
    const root = timelineRootRef.current;
    if (!root) return;

    const onWheel = (e: WheelEvent) => {
      const node = scrollRef.current;
      const main = node?.closest('main');
      if (!node || !main) return;
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        node.scrollLeft += e.deltaX;
        e.preventDefault();
        return;
      }
      if (e.deltaY !== 0) {
        main.scrollBy({ top: e.deltaY });
        e.preventDefault();
      }
    };

    root.addEventListener('wheel', onWheel, { passive: false });
    return () => root.removeEventListener('wheel', onWheel);
  }, [loading, resources.length]);

  const sym = currency === 'EUR' ? '€' : '£';

  return (
    <div className="flex flex-col">
      {!compactToolbar && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="date"
              value={date}
              onChange={(e) => onDateChange?.(e.target.value)}
              className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
            />
            <Link
              href="/dashboard/bookings/new"
              className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800"
            >
              New resource booking
            </Link>
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={showAvailability}
              onChange={(e) => setShowAvailability(e.target.checked)}
              className="rounded border-slate-300"
            />
            Show free starts
          </label>
        </div>
      )}

      {compactToolbar && (
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={showAvailability}
              onChange={(e) => setShowAvailability(e.target.checked)}
              className="rounded border-slate-300"
            />
            Show free slot starts
          </label>
          {showAvailability && (
            <div className="flex items-center gap-1 text-sm text-slate-600">
              <span>Duration</span>
              <NumericInput
                min={5}
                max={480}
                value={availabilityDuration}
                onChange={setAvailabilityDuration}
                className="w-16 rounded border border-slate-200 px-1 py-0.5 text-sm"
              />
              <span>min</span>
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      )}

      {loading ? (
        <div className="flex min-h-[320px] items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-teal-600 border-t-transparent" />
        </div>
      ) : resources.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-slate-500">
          <p>No active resources configured.</p>
          <p className="mt-2 text-sm">Add resources under Settings or your venue setup checklist.</p>
        </div>
      ) : (
        <div ref={timelineRootRef}>
        <div
          ref={scrollRef}
          className="min-w-0 w-full touch-manipulation overflow-x-auto rounded-xl border border-slate-200 bg-white motion-safe:scroll-smooth"
        >
          <div className="flex min-w-[560px]">
            <div className="w-14 flex-shrink-0 border-r border-slate-100 bg-slate-50">
              <div className="h-10 border-b border-slate-100" />
              <div className="relative" style={{ height: TOTAL_SLOTS * SLOT_HEIGHT }}>
                {timeLabels.map((t, i) =>
                  i % 4 === 0 ? (
                    <div
                      key={t}
                      className="absolute left-0 w-full pr-1 text-right text-[11px] text-slate-400"
                      style={{ top: i * SLOT_HEIGHT - 6 }}
                    >
                      {t}
                    </div>
                  ) : null,
                )}
              </div>
            </div>

            {resources.map((res) => {
              const colBookings = bookingsForResource(res.id);
              const freeStarts = availSlots[res.id] ?? [];
              return (
                <div key={res.id} className="min-w-[160px] flex-1 border-r border-slate-100 last:border-r-0">
                  <div className="sticky top-0 z-10 flex h-10 flex-col items-center justify-center border-b border-slate-100 bg-white px-2 py-1">
                    <span className="truncate text-center text-xs font-semibold text-slate-900">{res.name}</span>
                    <span className="text-[10px] text-slate-400">
                      {res.min_booking_minutes}–{res.max_booking_minutes} min
                      {res.price_per_slot_pence != null && res.price_per_slot_pence > 0
                        ? ` · ${sym}${(res.price_per_slot_pence / 100).toFixed(0)}/slot`
                        : ''}
                    </span>
                  </div>
                  <div className="relative" style={{ height: TOTAL_SLOTS * SLOT_HEIGHT }}>
                    {timeLabels.map((_, i) => (
                      <div
                        key={i}
                        className={`absolute left-0 w-full border-t ${i % 4 === 0 ? 'border-slate-100' : 'border-slate-50'}`}
                        style={{ top: i * SLOT_HEIGHT }}
                      />
                    ))}

                    {showAvailability &&
                      freeStarts.map((s) => (
                        <div
                          key={s.start_time}
                          className="pointer-events-none absolute left-1 right-1 z-[5] rounded-sm bg-emerald-400/25"
                          style={{
                            top: slotTop(s.start_time),
                            height: 6,
                          }}
                          title={`Available start ${s.start_time.slice(0, 5)} (${availabilityDuration} min)`}
                        />
                      ))}

                    {colBookings.map((b) => {
                      const dur = bookingDurationMins(b);
                      const top = slotTop(b.booking_time);
                      const height = slotHeightFromDuration(dur);
                      const st = STATUS_COLOURS[b.status] ?? STATUS_COLOURS.Confirmed;
                      return (
                        <button
                          key={b.id}
                          type="button"
                          onClick={() => setDetailBookingId(b.id)}
                          className={`absolute left-1 right-1 z-[15] overflow-hidden rounded-lg border text-left shadow-sm transition hover:shadow-md ${st.bg} ${st.border}`}
                          style={{ top, height, borderLeftWidth: 3, borderLeftColor: '#0d9488' }}
                        >
                          <div className={`px-1.5 py-1 ${st.text}`}>
                            <div className="flex flex-wrap items-center gap-1">
                              <span className="truncate text-xs font-semibold">{b.guest_name}</span>
                              {['Pending', 'Confirmed'].includes(b.status) && showDepositPendingPill(b) && (
                                <span
                                  className="inline-flex h-1.5 w-1.5 shrink-0 rounded-full bg-orange-500"
                                  aria-hidden
                                  title="Deposit pending"
                                />
                              )}
                              {['Pending', 'Confirmed'].includes(b.status) && showAttendanceConfirmedPill(b) && (
                                <span
                                  className="inline-flex h-1.5 w-1.5 shrink-0 rounded-full bg-teal-500"
                                  aria-hidden
                                  title="Confirmed"
                                />
                              )}
                            </div>
                            <div className="text-[10px] text-slate-500">
                              {b.booking_time.slice(0, 5)} – {minutesToTime(timeToMinutes(b.booking_time) + dur)}
                            </div>
                            {height > 40 && (
                              <div className="text-[10px] text-slate-400">
                                {b.party_size} pax · {b.status}
                              </div>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-500">
        <span>
          <span className="mr-1 inline-block h-2 w-6 rounded bg-emerald-400/40 align-middle" /> Free slot start (when enabled)
        </span>
        <span>
          <span className="mr-1 inline-block h-2 w-6 rounded border border-teal-600 bg-blue-50 align-middle" /> Booking
        </span>
      </div>

      <AppointmentDetailSheet
        open={detailBookingId !== null}
        bookingId={detailBookingId}
        onClose={() => setDetailBookingId(null)}
        onUpdated={() => void fetchAll()}
        currency={currency}
        practitioners={[]}
        prefetchedBooking={detailPrefetch}
        services={[]}
      />
    </div>
  );
}
