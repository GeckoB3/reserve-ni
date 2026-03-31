'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  memo,
  type MouseEvent,
  type ReactNode,
} from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { createClient } from '@/lib/supabase/browser';
import { AppointmentBookingForm } from '@/components/booking/AppointmentBookingForm';
import { AppointmentWalkInModal } from '@/components/booking/AppointmentWalkInModal';
import {
  AppointmentDetailSheet,
  type AppointmentDetailPrefetch,
} from '@/components/booking/AppointmentDetailSheet';
import { useToast } from '@/components/ui/Toast';
import { getCalendarGridBounds } from '@/lib/venue-calendar-bounds';
import { canMarkNoShowForSlot, type BookingStatus } from '@/lib/table-management/booking-status';
import type { OpeningHours } from '@/types/availability';

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
  price_pence?: number | null;
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
  guest_visit_count: number | null;
  estimated_end_time: string | null;
  special_requests: string | null;
  internal_notes: string | null;
  client_arrived_at: string | null;
  deposit_amount_pence: number | null;
  deposit_status: string;
  group_booking_id?: string | null;
}

interface CalendarBlock {
  id: string;
  practitioner_id: string;
  block_date: string;
  start_time: string;
  end_time: string;
  reason: string | null;
}

type ViewMode = 'day' | 'week' | 'month';

const SLOT_HEIGHT = 48;
const SLOT_MINUTES = 15;

const STATUS_COLOURS: Record<string, { bg: string; text: string; border: string }> = {
  Pending: { bg: 'bg-orange-50', text: 'text-orange-900', border: 'border-orange-200' },
  Confirmed: { bg: 'bg-blue-50', text: 'text-blue-800', border: 'border-blue-200' },
  Seated: { bg: 'bg-violet-50', text: 'text-violet-900', border: 'border-violet-200' },
  Completed: { bg: 'bg-emerald-50', text: 'text-emerald-900', border: 'border-emerald-200' },
  'No-Show': { bg: 'bg-red-50', text: 'text-red-800', border: 'border-red-200' },
  Cancelled: { bg: 'bg-slate-100', text: 'text-slate-500', border: 'border-slate-200' },
};

/** Marked arrived, not yet started — amber block (matches waiting dot). */
const ARRIVED_WAITING_STYLE = {
  bg: 'bg-amber-50',
  text: 'text-amber-950',
  border: 'border-amber-200',
} as const;

const ARRIVED_WAITING_ACCENT_HEX = '#D97706';

function isArrivedWaitingDisplay(b: Pick<Booking, 'client_arrived_at' | 'status'>): boolean {
  if (!b.client_arrived_at) return false;
  return b.status === 'Pending' || b.status === 'Confirmed';
}

function bookingCalendarBlockStyle(b: Booking): { bg: string; text: string; border: string } {
  if (isArrivedWaitingDisplay(b)) return ARRIVED_WAITING_STYLE;
  return STATUS_COLOURS[b.status] ?? STATUS_COLOURS.Confirmed;
}

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
  const hh = Math.floor(m / 60) % 24;
  const mm = m % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

/** Fixed en-GB-style labels so SSR and browser match (Node vs Chrome format `toLocaleDateString` differently). */
const WEEKDAY_LONG_EN_GB = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;
const MONTH_LONG_EN_GB = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

function formatDateLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  return `${WEEKDAY_LONG_EN_GB[d.getDay()]}, ${d.getDate()} ${MONTH_LONG_EN_GB[d.getMonth()]} ${d.getFullYear()}`;
}

function addDays(date: string, days: number): string {
  const d = new Date(date + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function startOfMonth(date: string): string {
  return `${date.slice(0, 7)}-01`;
}

function formatMonthYearGb(monthAnchor: string): string {
  const d = new Date(`${startOfMonth(monthAnchor)}T12:00:00`);
  return `${MONTH_LONG_EN_GB[d.getMonth()]} ${d.getFullYear()}`;
}

function endOfMonth(date: string): string {
  const [y, m] = date.split('-').map(Number);
  const last = new Date(y!, m!, 0).getDate();
  return `${date.slice(0, 7)}-${String(last).padStart(2, '0')}`;
}

const WEEK_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function weekDatesFrom(start: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

function overlapsRange(a0: number, a1: number, b0: number, b1: number): boolean {
  return a0 < b1 && b0 < a1;
}

type BookingCluster = { kind: 'single'; booking: Booking } | { kind: 'group'; items: Booking[] };

/** Merge consecutive multi-service rows (same group_booking_id) into one visual stack. */
function clusterMultiServiceBookings(bookings: Booking[]): BookingCluster[] {
  const sorted = [...bookings].sort((a, b) => timeToMinutes(a.booking_time) - timeToMinutes(b.booking_time));
  const byGroup = new Map<string, Booking[]>();
  for (const b of bookings) {
    if (b.group_booking_id) {
      const g = byGroup.get(b.group_booking_id) ?? [];
      g.push(b);
      byGroup.set(b.group_booking_id, g);
    }
  }
  for (const [, arr] of byGroup) {
    arr.sort((a, b) => timeToMinutes(a.booking_time) - timeToMinutes(b.booking_time));
  }
  const seen = new Set<string>();
  const out: BookingCluster[] = [];
  for (const b of sorted) {
    if (!b.group_booking_id) {
      out.push({ kind: 'single', booking: b });
      continue;
    }
    if (seen.has(b.group_booking_id)) continue;
    seen.add(b.group_booking_id);
    const items = byGroup.get(b.group_booking_id) ?? [b];
    if (items.length <= 1) {
      out.push({ kind: 'single', booking: items[0]! });
    } else {
      out.push({ kind: 'group', items });
    }
  }
  return out;
}

function todayLocalISO(): string {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
}

function bookingToPrefetch(b: Booking): AppointmentDetailPrefetch {
  return {
    id: b.id,
    booking_date: b.booking_date,
    booking_time: b.booking_time,
    booking_end_time: b.booking_end_time,
    status: b.status,
    practitioner_id: b.practitioner_id,
    appointment_service_id: b.appointment_service_id,
    special_requests: b.special_requests,
    internal_notes: b.internal_notes,
    client_arrived_at: b.client_arrived_at,
    deposit_amount_pence: b.deposit_amount_pence,
    deposit_status: b.deposit_status,
    party_size: b.party_size,
    guest_name: b.guest_name,
    guest_email: b.guest_email,
    guest_phone: b.guest_phone,
    guest_visit_count: b.guest_visit_count,
  };
}

function CalendarBookingQuickActions({
  b,
  busy,
  graceMinutes,
  onStatus,
  onArrived,
}: {
  b: Booking;
  busy: boolean;
  graceMinutes: number;
  onStatus: (id: string, next: BookingStatus) => void;
  onArrived: (id: string, arrived: boolean) => void;
}) {
  if (b.status === 'Cancelled' || b.status === 'No-Show') return null;

  const arrived = Boolean(b.client_arrived_at);
  const canNoShow =
    b.status === 'Confirmed' && canMarkNoShowForSlot(b.booking_date, b.booking_time, graceMinutes);

  return (
    <div
      className="flex shrink-0 flex-wrap content-start justify-end gap-0.5 self-start py-1 pl-0.5 pr-0.5"
      onPointerDown={(e) => e.stopPropagation()}
    >
      {b.status === 'Completed' && (
        <button
          type="button"
          disabled={busy}
          onClick={() => onStatus(b.id, 'Seated')}
          className="rounded bg-amber-50 px-1 py-0.5 text-[10px] font-medium text-amber-900 ring-1 ring-amber-200/80 hover:bg-amber-100 disabled:opacity-50"
        >
          Reopen
        </button>
      )}
      {b.status !== 'Completed' && (
        <>
          {(b.status === 'Pending' || b.status === 'Confirmed') && (
            <>
              {!arrived ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onArrived(b.id, true)}
                  className="rounded border border-amber-300 bg-amber-50 px-1 py-0.5 text-[10px] font-medium text-amber-900 hover:bg-amber-100 disabled:opacity-50"
                >
                  Arrived
                </button>
              ) : (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onArrived(b.id, false)}
                  className="rounded border border-slate-200 bg-white px-1 py-0.5 text-[10px] font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                >
                  Clear
                </button>
              )}
            </>
          )}
          {b.status === 'Pending' && (
            <button
              type="button"
              disabled={busy}
              onClick={() => onStatus(b.id, 'Confirmed')}
              className="rounded bg-blue-600 px-1 py-0.5 text-[10px] font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              Confirm
            </button>
          )}
          {b.status === 'Confirmed' && (
            <button
              type="button"
              disabled={busy}
              onClick={() => onStatus(b.id, 'Seated')}
              className="rounded bg-blue-600 px-1 py-0.5 text-[10px] font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              Start
            </button>
          )}
          {b.status === 'Seated' && (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={() => onStatus(b.id, 'Confirmed')}
                className="rounded border border-slate-300 bg-white px-1 py-0.5 text-[10px] font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                title="If you started by mistake, go back to confirmed (and waiting if they were marked arrived)"
              >
                Undo start
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => onStatus(b.id, 'Completed')}
                className="rounded bg-emerald-600 px-1 py-0.5 text-[10px] font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                Complete
              </button>
            </>
          )}
          {b.status === 'Confirmed' && canNoShow && (
            <button
              type="button"
              disabled={busy}
              onClick={() => onStatus(b.id, 'No-Show')}
              className="rounded px-1 py-0.5 text-[10px] text-slate-500 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
            >
              No show
            </button>
          )}
        </>
      )}
    </div>
  );
}

function slotOccupied(
  slotStart: number,
  bookings: Booking[],
  blocks: CalendarBlock[],
  pracId: string,
  dateStr: string,
  serviceMap: Map<string, AppointmentService>,
): boolean {
  for (const b of bookings) {
    if (b.practitioner_id !== pracId || b.booking_date !== dateStr) continue;
    if (['Cancelled', 'No-Show'].includes(b.status)) continue; // Completed still occupies the slot for scheduling
    const dur =
      b.booking_end_time != null
        ? Math.max(SLOT_MINUTES, timeToMinutes(b.booking_end_time) - timeToMinutes(b.booking_time))
        : b.appointment_service_id
          ? serviceMap.get(b.appointment_service_id)?.duration_minutes ?? 30
          : 30;
    const b0 = timeToMinutes(b.booking_time);
    const b1 = b0 + Math.max(dur, SLOT_MINUTES);
    if (overlapsRange(slotStart, slotStart + SLOT_MINUTES, b0, b1)) return true;
  }
  for (const bl of blocks) {
    if (bl.practitioner_id !== pracId || bl.block_date !== dateStr) continue;
    const b0 = timeToMinutes(bl.start_time);
    const b1 = timeToMinutes(bl.end_time);
    if (overlapsRange(slotStart, slotStart + SLOT_MINUTES, b0, b1)) return true;
  }
  return false;
}

const DroppableSlotButton = memo(function DroppableSlotButton({
  id,
  pracId,
  dateStr,
  slotStartMins,
  top,
  disabled,
  onEmptyClick,
}: {
  id: string;
  pracId: string;
  dateStr: string;
  slotStartMins: number;
  top: number;
  disabled: boolean;
  onEmptyClick: (e: MouseEvent, p: string, d: string, t: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id,
    disabled,
    data: { pracId, dateStr, slotStartMins },
  });
  const tlabel = minutesToTime(slotStartMins);
  return (
    <button
      type="button"
      ref={setNodeRef}
      disabled={disabled}
      onClick={(e) => {
        if (!disabled) onEmptyClick(e, pracId, dateStr, tlabel);
      }}
      className={`absolute left-0 right-0 z-0 border-t border-slate-50 transition-colors ${
        disabled ? 'pointer-events-none cursor-default' : 'cursor-pointer hover:bg-brand-500/5'
      } ${isOver ? 'bg-brand-500/15' : ''}`}
      style={{ top, height: SLOT_HEIGHT }}
      aria-label={`Empty slot ${tlabel}`}
    />
  );
});

type DraggableHandleProps = {
  listeners: ReturnType<typeof useDraggable>['listeners'] | undefined;
  attributes: ReturnType<typeof useDraggable>['attributes'] | undefined;
};

function DragBookingPreview({ booking }: { booking: Booking }) {
  const st = bookingCalendarBlockStyle(booking);
  return (
    <div className={`rounded-lg border px-2 py-1 text-xs shadow-xl ${st.bg} ${st.border}`}>{booking.guest_name}</div>
  );
}

const DraggableBookingShell = memo(function DraggableBookingShell({
  booking,
  top,
  height,
  canDrag,
  children,
}: {
  booking: Booking;
  top: number;
  height: number;
  canDrag: boolean;
  children: (handle: DraggableHandleProps) => ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `booking-${booking.id}`,
    disabled: !canDrag,
    data: { booking },
  });
  const style = {
    top,
    height,
    transform: CSS.Translate.toString(transform),
    zIndex: isDragging ? 50 : 20,
    opacity: isDragging ? 0.85 : 1,
  };
  const handleProps: DraggableHandleProps = canDrag
    ? { listeners, attributes }
    : { listeners: undefined, attributes: undefined };
  return (
    <div ref={setNodeRef} className="absolute left-1 right-1" style={style}>
      {children(handleProps)}
    </div>
  );
});

export function PractitionerCalendarView({
  venueId,
  currency = 'GBP',
  defaultPractitionerFilter = 'all',
  linkedPractitionerId = null,
}: {
  venueId: string;
  currency?: string;
  defaultPractitionerFilter?: 'all' | string;
  linkedPractitionerId?: string | null;
}) {
  const { addToast } = useToast();
  const [viewMode, setViewMode] = useState<ViewMode>('day');
  const [date, setDate] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  });
  const [weekStart, setWeekStart] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  });
  const [monthAnchor, setMonthAnchor] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  });

  const [openingHours, setOpeningHours] = useState<OpeningHours | null>(null);
  const [practitioners, setPractitioners] = useState<Practitioner[]>([]);
  const [services, setServices] = useState<AppointmentService[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [blocks, setBlocks] = useState<CalendarBlock[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailBookingId, setDetailBookingId] = useState<string | null>(null);
  const [filterPractitioner, setFilterPractitioner] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [showNewAppointment, setShowNewAppointment] = useState(false);
  const [showWalkIn, setShowWalkIn] = useState(false);
  const [prefillPractitionerId, setPrefillPractitionerId] = useState<string | undefined>();
  const [prefillTime, setPrefillTime] = useState<string | undefined>();
  const [prefillDate, setPrefillDate] = useState<string | undefined>();
  const [slotMenu, setSlotMenu] = useState<{
    pracId: string;
    dateStr: string;
    time: string;
    x: number;
    y: number;
  } | null>(null);
  const [blockModal, setBlockModal] = useState<{
    blockId?: string;
    pracId: string;
    dateStr: string;
    startTime: string;
    endTime: string;
    reason: string;
  } | null>(null);
  const [blockSaving, setBlockSaving] = useState(false);
  const [dragBooking, setDragBooking] = useState<Booking | null>(null);
  const [flashIds, setFlashIds] = useState<Set<string>>(() => new Set());
  const [quickActionId, setQuickActionId] = useState<string | null>(null);
  const [noShowGraceMinutes, setNoShowGraceMinutes] = useState(15);
  const scrollRef = useRef<HTMLDivElement>(null);
  const touchX = useRef<number | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 10 } }));

  const activeDayDate = viewMode === 'day' ? date : viewMode === 'week' ? weekStart : monthAnchor;
  const { startHour, endHour } = useMemo(
    () => getCalendarGridBounds(activeDayDate, openingHours ?? undefined, 7, 21),
    [activeDayDate, openingHours],
  );
  const TOTAL_SLOTS = ((endHour - startHour) * 60) / SLOT_MINUTES;

  const listFromTo = useMemo(() => {
    if (viewMode === 'day') return { from: date, to: date };
    if (viewMode === 'week') return { from: weekStart, to: addDays(weekStart, 6) };
    return { from: startOfMonth(monthAnchor), to: endOfMonth(monthAnchor) };
  }, [viewMode, date, weekStart, monthAnchor]);

  const fetchData = useCallback(
    async (options?: { silent?: boolean }) => {
      const silent = options?.silent ?? false;
      if (!silent) {
        setLoading(true);
        setFetchError(null);
      }
      try {
        const { from, to } = listFromTo;
        const params = from === to ? `date=${from}` : `from=${from}&to=${to}`;
        const [pracRes, bookRes, svcRes, blockRes] = await Promise.all([
          fetch('/api/venue/practitioners?roster=1'),
          fetch(`/api/venue/bookings/list?${params}`),
          fetch('/api/venue/appointment-services'),
          fetch(
            from === to
              ? `/api/venue/practitioner-calendar-blocks?date=${from}`
              : `/api/venue/practitioner-calendar-blocks?from=${from}&to=${to}`,
          ),
        ]);
        if (!pracRes.ok || !bookRes.ok || !svcRes.ok) {
          setFetchError('Failed to load calendar data. Please refresh the page.');
          return;
        }
        const [pracData, bookData, svcData] = await Promise.all([
          pracRes.json(),
          bookRes.json(),
          svcRes.json(),
        ]);
        setPractitioners(pracData.practitioners ?? []);
        setBookings((bookData.bookings ?? []).filter((b: Booking) => b.practitioner_id));
        setServices(svcData.services ?? []);
        if (blockRes.ok) {
          const bjson = await blockRes.json();
          setBlocks(bjson.blocks ?? []);
        } else {
          setBlocks([]);
        }
      } catch {
        setFetchError('Failed to load calendar data. Please check your connection.');
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [listFromTo],
  );

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  useEffect(() => {
    void fetch('/api/venue')
      .then((r) => (r.ok ? r.json() : null))
      .then((v) => {
        if (v?.opening_hours) setOpeningHours(v.opening_hours as OpeningHours);
        const g = (v as { no_show_grace_minutes?: number } | null)?.no_show_grace_minutes;
        if (typeof g === 'number' && g >= 10 && g <= 60) setNoShowGraceMinutes(g);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (loading || viewMode !== 'day') return;
    const el = scrollRef.current;
    if (!el) return;
    if (date === todayLocalISO()) {
      const now = new Date();
      const nowM = now.getHours() * 60 + now.getMinutes();
      const gridStartM = startHour * 60;
      const gridEndM = endHour * 60;
      const clampedM = Math.min(Math.max(nowM, gridStartM), Math.max(gridEndM - SLOT_MINUTES, gridStartM));
      const slotFromStart = (clampedM - gridStartM) / SLOT_MINUTES;
      const targetY = slotFromStart * SLOT_HEIGHT;
      const viewH = el.clientHeight;
      el.scrollTop = Math.max(0, targetY - viewH * 0.28);
    } else {
      const eightAm = ((8 - startHour) * 60) / SLOT_MINUTES;
      el.scrollTop = Math.max(0, eightAm * SLOT_HEIGHT);
    }
  }, [loading, viewMode, date, startHour, endHour]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`calendar-${venueId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'bookings', filter: `venue_id=eq.${venueId}` },
        (payload) => {
          const row = payload.new as { id?: string } | null;
          if (row?.id) {
            setFlashIds((prev) => new Set(prev).add(row.id!));
            window.setTimeout(() => {
              setFlashIds((prev) => {
                const n = new Set(prev);
                n.delete(row.id!);
                return n;
              });
            }, 2200);
          }
          void fetchData({ silent: true });
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'practitioner_calendar_blocks', filter: `venue_id=eq.${venueId}` },
        () => {
          void fetchData({ silent: true });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [venueId, fetchData]);

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

  function bookingsForPractitioner(pracId: string, dayDate: string): Booking[] {
    return bookings.filter((b) => {
      if (b.booking_date !== dayDate) return false;
      if (b.practitioner_id !== pracId) return false;
      if (filterStatus !== 'all' && b.status !== filterStatus) return false;
      return true;
    });
  }

  function getBookingDuration(b: Booking): number {
    if (b.booking_end_time) {
      return Math.max(SLOT_MINUTES, timeToMinutes(b.booking_end_time) - timeToMinutes(b.booking_time));
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

  function slotTop(time: string): number {
    const mins = timeToMinutes(time);
    const offset = mins - startHour * 60;
    return (offset / SLOT_MINUTES) * SLOT_HEIGHT;
  }

  function slotHeightFromDuration(durationMins: number): number {
    return Math.max((durationMins / SLOT_MINUTES) * SLOT_HEIGHT, SLOT_HEIGHT * 0.75);
  }

  function navigateDay(dir: -1 | 1) {
    if (viewMode === 'day') setDate((d) => addDays(d, dir));
    else if (viewMode === 'week') setWeekStart((d) => addDays(d, dir * 7));
    else {
      const d = new Date(`${monthAnchor}T12:00:00`);
      d.setMonth(d.getMonth() + dir);
      setMonthAnchor(d.toISOString().slice(0, 10));
    }
  }

  function goToday() {
    const now = new Date();
    const t = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    setDate(t);
    setWeekStart(t);
    setMonthAnchor(t);
  }

  function openNewAtSlot(pracId: string, dateStr: string, time: string) {
    setPrefillPractitionerId(pracId);
    setPrefillDate(dateStr);
    setPrefillTime(time);
    setShowNewAppointment(true);
    setSlotMenu(null);
  }

  function openBlockModal(pracId: string, dateStr: string, startTime: string) {
    const sm = timeToMinutes(startTime);
    const endM = Math.min(sm + 60, endHour * 60);
    setBlockModal({
      pracId,
      dateStr,
      startTime,
      endTime: minutesToTime(endM),
      reason: '',
    });
    setSlotMenu(null);
  }

  function openEditBlockModal(bl: CalendarBlock) {
    const st = bl.start_time.length >= 5 ? bl.start_time.slice(0, 5) : bl.start_time;
    const en = bl.end_time.length >= 5 ? bl.end_time.slice(0, 5) : bl.end_time;
    setBlockModal({
      blockId: bl.id,
      pracId: bl.practitioner_id,
      dateStr: bl.block_date,
      startTime: st,
      endTime: en,
      reason: bl.reason ?? '',
    });
  }

  async function saveBlock() {
    if (!blockModal) return;
    if (timeToMinutes(blockModal.endTime) <= timeToMinutes(blockModal.startTime)) {
      addToast('End time must be after start time', 'error');
      return;
    }
    setBlockSaving(true);
    try {
      if (blockModal.blockId) {
        const res = await fetch(`/api/venue/practitioner-calendar-blocks/${blockModal.blockId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            end_time: blockModal.endTime,
            reason: blockModal.reason.trim() || null,
          }),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          addToast((j as { error?: string }).error ?? 'Could not update block', 'error');
          return;
        }
      } else {
        const res = await fetch('/api/venue/practitioner-calendar-blocks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            practitioner_id: blockModal.pracId,
            block_date: blockModal.dateStr,
            start_time: blockModal.startTime,
            end_time: blockModal.endTime,
            reason: blockModal.reason.trim() || undefined,
          }),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          addToast((j as { error?: string }).error ?? 'Could not create block', 'error');
          return;
        }
      }
      setBlockModal(null);
      void fetchData({ silent: true });
    } catch {
      addToast(blockModal.blockId ? 'Could not update block' : 'Could not create block', 'error');
    } finally {
      setBlockSaving(false);
    }
  }

  async function deleteBlockFromModal() {
    if (!blockModal?.blockId) return;
    if (!window.confirm('Remove this blocked time?')) return;
    setBlockSaving(true);
    try {
      const res = await fetch(`/api/venue/practitioner-calendar-blocks/${blockModal.blockId}`, { method: 'DELETE' });
      if (!res.ok) addToast('Could not remove block', 'error');
      else {
        setBlockModal(null);
        void fetchData({ silent: true });
      }
    } finally {
      setBlockSaving(false);
    }
  }

  async function patchBookingMove(booking: Booking, newDate: string, newTime: string, newPracId: string) {
    const prev = { ...booking };
    setBookings((rows) =>
      rows.map((b) =>
        b.id === booking.id
          ? {
              ...b,
              booking_date: newDate,
              booking_time: newTime.length === 5 ? `${newTime}:00` : newTime,
              practitioner_id: newPracId,
            }
          : b,
      ),
    );
    try {
      const res = await fetch(`/api/venue/bookings/${booking.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          booking_date: newDate,
          booking_time: newTime.length === 5 ? `${newTime}:00` : newTime,
          practitioner_id: newPracId,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        addToast((j as { error?: string }).error ?? 'Could not move appointment', 'error');
        setBookings((rows) => rows.map((b) => (b.id === prev.id ? prev : b)));
        return;
      }
      void fetchData({ silent: true });
    } catch {
      addToast('Could not move appointment', 'error');
      setBookings((rows) => rows.map((b) => (b.id === prev.id ? prev : b)));
    }
  }

  async function quickPatchBooking(bookingId: string, body: Record<string, unknown>) {
    setQuickActionId(bookingId);
    try {
      const res = await fetch(`/api/venue/bookings/${bookingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        addToast((j as { error?: string }).error ?? 'Update failed', 'error');
        return;
      }
      void fetchData({ silent: true });
    } catch {
      addToast('Update failed', 'error');
    } finally {
      setQuickActionId(null);
    }
  }

  function handleDragStart(e: DragStartEvent) {
    const b = e.active.data.current?.booking as Booking | undefined;
    setDragBooking(b ?? null);
  }

  function handleDragEnd(e: DragEndEvent) {
    setDragBooking(null);
    const b = e.active.data.current?.booking as Booking | undefined;
    const over = e.over;
    if (!b || !over?.data?.current) return;
    const { pracId, dateStr, slotStartMins } = over.data.current as {
      pracId: string;
      dateStr: string;
      slotStartMins: number;
    };
    const newTime = minutesToTime(slotStartMins);
    if (
      b.booking_date === dateStr &&
      b.practitioner_id === pracId &&
      b.booking_time.slice(0, 5) === newTime
    ) {
      return;
    }
    if (!['Pending', 'Confirmed', 'Seated'].includes(b.status)) return;
    void patchBookingMove(b, dateStr, newTime, pracId);
  }

  const timeLabels = Array.from({ length: TOTAL_SLOTS + 1 }, (_, i) => {
    const mins = startHour * 60 + i * SLOT_MINUTES;
    return minutesToTime(mins);
  });

  const bookingsMatchingFilters = useMemo(() => {
    return bookings.filter((b) => {
      if (filterPractitioner !== 'all' && b.practitioner_id !== filterPractitioner) return false;
      if (filterStatus !== 'all' && b.status !== filterStatus) return false;
      return true;
    });
  }, [bookings, filterPractitioner, filterStatus]);

  const todayBookings = bookingsMatchingFilters.filter((b) => !['Cancelled', 'No-Show'].includes(b.status));
  const confirmedCount = bookingsMatchingFilters.filter((b) => b.status === 'Confirmed').length;
  const completedCount = bookingsMatchingFilters.filter((b) => b.status === 'Completed').length;

  const weekDays = useMemo(() => weekDatesFrom(weekStart), [weekStart]);

  const monthCells = useMemo(() => {
    const first = new Date(`${startOfMonth(monthAnchor)}T12:00:00`);
    const startPad = first.getDay();
    const from = addDays(startOfMonth(monthAnchor), -startPad);
    return Array.from({ length: 42 }, (_, i) => addDays(from, i));
  }, [monthAnchor]);

  const countsByDate = useMemo(() => {
    const m: Record<string, number> = {};
    for (const b of bookingsMatchingFilters) {
      m[b.booking_date] = (m[b.booking_date] ?? 0) + 1;
    }
    return m;
  }, [bookingsMatchingFilters]);

  const detailPrefetch = useMemo((): AppointmentDetailPrefetch | null => {
    if (!detailBookingId) return null;
    const b = bookings.find((x) => x.id === detailBookingId);
    return b ? bookingToPrefetch(b) : null;
  }, [detailBookingId, bookings]);

  const headerTitle =
    viewMode === 'day'
      ? formatDateLabel(date)
      : viewMode === 'week'
        ? `${WEEK_SHORT[new Date(`${weekStart}T12:00:00`).getDay()]} ${weekStart.slice(8, 10)} – ${addDays(weekStart, 6)}`
        : formatMonthYearGb(monthAnchor);

  return (
    <div className="flex min-h-0 flex-col h-[calc(100dvh-72px)] md:h-[calc(100dvh-100px)] lg:h-[calc(100dvh-120px)]">
      <div className="flex-shrink-0 space-y-3 pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-xl font-semibold text-slate-900 sm:text-2xl">Calendar</h1>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-lg border border-slate-200 p-0.5 text-xs font-medium">
              {(['day', 'week', 'month'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setViewMode(m)}
                  className={`rounded-md px-2.5 py-1 capitalize ${
                    viewMode === m ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => navigateDay(-1)}
              className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm hover:bg-slate-50"
            >
              &larr;
            </button>
            <button
              type="button"
              onClick={goToday}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium hover:bg-slate-50"
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => navigateDay(1)}
              className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm hover:bg-slate-50"
            >
              &rarr;
            </button>
            {viewMode === 'day' && (
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
              />
            )}
          </div>
        </div>

        <div className="text-sm text-slate-500">{headerTitle}</div>

        <div className="flex flex-wrap items-center gap-3">
          <select
            value={filterPractitioner}
            onChange={(e) => setFilterPractitioner(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          >
            <option value="all">All appointments</option>
            {linkedPractitionerId === null ? (
              activePractitioners.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))
            ) : (
              <>
                <option value={linkedPractitionerId}>My appointments</option>
                {activePractitioners
                  .filter((p) => p.id !== linkedPractitionerId)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </>
            )}
          </select>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          >
            <option value="all">All statuses</option>
            <option value="Pending">Pending</option>
            <option value="Confirmed">Confirmed</option>
            <option value="Seated">In Progress</option>
            <option value="Completed">Completed</option>
            <option value="No-Show">No Show</option>
            <option value="Cancelled">Cancelled</option>
          </select>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                setPrefillDate(viewMode === 'day' ? date : undefined);
                setPrefillTime(undefined);
                setPrefillPractitionerId(filterPractitioner === 'all' ? undefined : filterPractitioner);
                setShowNewAppointment(true);
              }}
              className="flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-brand-700"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              New Appointment
            </button>
            <button
              type="button"
              onClick={() => setShowWalkIn(true)}
              className="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-emerald-700"
            >
              Walk-in
            </button>
          </div>

          <div className="ml-auto flex flex-wrap items-center gap-4 text-sm">
            <span className="text-slate-500">
              <span className="font-semibold text-slate-900">{todayBookings.length}</span> appointments
            </span>
            <span className="hidden sm:inline text-slate-500">
              <span className="font-semibold text-blue-600">{confirmedCount}</span> confirmed
            </span>
            <span className="hidden sm:inline text-slate-500">
              <span className="font-semibold text-green-600">{completedCount}</span> completed
            </span>
          </div>
        </div>
      </div>

      {fetchError && (
        <div className="mb-3 flex items-center justify-between rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <span>{fetchError}</span>
          <button type="button" onClick={() => setFetchError(null)} className="ml-2 text-red-400 hover:text-red-600">
            &times;
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex min-h-0 flex-1 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
        </div>
      ) : filteredPractitioners.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <div className="rounded-xl border border-slate-200 bg-white p-12 text-center">
            <p className="text-slate-500">No team members configured yet. Add them in Availability settings.</p>
          </div>
        </div>
      ) : viewMode === 'month' ? (
        <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-slate-200 bg-white p-4">
          <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-slate-500">
            {WEEK_SHORT.map((d) => (
              <div key={d} className="py-2">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {monthCells.map((cell) => {
              const inMonth = cell.startsWith(monthAnchor.slice(0, 7));
              const c = countsByDate[cell] ?? 0;
              const maxC = Math.max(1, ...Object.values(countsByDate));
              const intensity = c === 0 ? 0 : Math.min(1, c / maxC);
              return (
                <button
                  key={cell}
                  type="button"
                  onClick={() => {
                    setDate(cell);
                    setWeekStart(cell);
                    setMonthAnchor(cell);
                    setViewMode('day');
                  }}
                  className={`flex min-h-[52px] flex-col items-center justify-center rounded-lg border text-sm transition-colors ${
                    inMonth ? 'border-slate-200 bg-white hover:bg-slate-50' : 'border-transparent bg-slate-50/50 text-slate-400'
                  }`}
                  style={{
                    backgroundColor:
                      c > 0 ? `rgba(99, 102, 241, ${0.12 + intensity * 0.45})` : undefined,
                  }}
                >
                  <span className="font-semibold text-slate-900">{Number(cell.slice(8, 10))}</span>
                  {c > 0 && <span className="text-[10px] text-slate-600">{c}</span>}
                </button>
              );
            })}
          </div>
        </div>
      ) : viewMode === 'week' ? (
        <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-slate-200 bg-white">
          <div className="min-w-[720px] overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="sticky left-0 z-10 bg-slate-50 px-3 py-2 text-left font-semibold text-slate-700">
                    Team
                  </th>
                  {weekDays.map((d) => (
                    <th key={d} className="px-2 py-2 text-center font-semibold text-slate-700">
                      <div>{WEEK_SHORT[new Date(`${d}T12:00:00`).getDay()]}</div>
                      <div className="text-xs font-normal text-slate-500">{d.slice(8, 10)}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredPractitioners.map((prac) => (
                  <tr key={prac.id} className="border-b border-slate-100">
                    <td className="sticky left-0 bg-white px-3 py-2 font-medium text-slate-900">{prac.name}</td>
                    {weekDays.map((d) => {
                      const dayBookings = bookingsForPractitioner(prac.id, d);
                      return (
                        <td key={d} className="align-top px-1 py-2">
                          <div className="flex min-h-[80px] flex-col gap-1">
                            {dayBookings.map((b) => {
                              const st = bookingCalendarBlockStyle(b);
                              const col = isArrivedWaitingDisplay(b) ? ARRIVED_WAITING_ACCENT_HEX : getBookingColour(b);
                              return (
                                <button
                                  key={b.id}
                                  type="button"
                                  onClick={() => setDetailBookingId(b.id)}
                                  className={`rounded-md border px-2 py-1 text-left text-xs ${st.bg} ${st.border}`}
                                  style={{ borderLeftWidth: 3, borderLeftColor: col }}
                                >
                                  <div className={`font-semibold truncate ${st.text}`}>{b.guest_name}</div>
                                  <div className="text-[10px] text-slate-500">
                                    {b.booking_time.slice(0, 5)} · {STATUS_LABELS[b.status] ?? b.status}
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
            <div
              ref={scrollRef}
              className="min-h-0 flex-1 overflow-x-auto overflow-y-auto rounded-xl border border-slate-200 bg-white motion-safe:scroll-smooth"
            onTouchStart={(e) => {
              touchX.current = e.touches[0].clientX;
            }}
            onTouchEnd={(e) => {
              if (touchX.current == null) return;
              const dx = e.changedTouches[0].clientX - touchX.current;
              touchX.current = null;
              if (Math.abs(dx) < 72) return;
              if (dx > 0) setDate((d) => addDays(d, -1));
              else setDate((d) => addDays(d, 1));
            }}
          >
            <div className="flex min-w-[600px]">
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

              {filteredPractitioners.map((prac) => {
                const pracBookings = bookingsForPractitioner(prac.id, date);
                const pracBlocks = blocks.filter((bl) => bl.practitioner_id === prac.id && bl.block_date === date);
                return (
                  <div key={prac.id} className="min-w-[180px] flex-1 border-r border-slate-100 last:border-r-0">
                    <div className="sticky top-0 z-10 flex h-10 items-center justify-center border-b border-slate-100 bg-white px-3 py-2">
                      <span className="truncate text-center text-sm font-semibold text-slate-900">{prac.name}</span>
                    </div>
                    <div className="relative" style={{ height: TOTAL_SLOTS * SLOT_HEIGHT }}>
                      {timeLabels.map((_, i) => (
                        <div
                          key={i}
                          className={`absolute left-0 w-full border-t ${i % 4 === 0 ? 'border-slate-100' : 'border-slate-50'}`}
                          style={{ top: i * SLOT_HEIGHT }}
                        />
                      ))}

                      {Array.from({ length: TOTAL_SLOTS }, (_, i) => {
                        const slotStartMins = startHour * 60 + i * SLOT_MINUTES;
                        const occ = slotOccupied(slotStartMins, bookings, blocks, prac.id, date, serviceMap);
                        const dropId = `drop-${prac.id}-${date}-${slotStartMins}`;
                        return (
                          <DroppableSlotButton
                            key={dropId}
                            id={dropId}
                            pracId={prac.id}
                            dateStr={date}
                            slotStartMins={slotStartMins}
                            top={i * SLOT_HEIGHT}
                            disabled={occ}
                            onEmptyClick={(ev, pid, dstr, t) => {
                              setSlotMenu({
                                pracId: pid,
                                dateStr: dstr,
                                time: t,
                                x: Math.max(8, Math.min(ev.clientX - 72, window.innerWidth - 200)),
                                y: Math.max(8, Math.min(ev.clientY - 8, window.innerHeight - 160)),
                              });
                            }}
                          />
                        );
                      })}

                      {pracBlocks.map((bl) => {
                        const top = slotTop(bl.start_time);
                        const h = Math.max(
                          ((timeToMinutes(bl.end_time) - timeToMinutes(bl.start_time)) / SLOT_MINUTES) * SLOT_HEIGHT,
                          SLOT_HEIGHT * 0.5,
                        );
                        return (
                          <button
                            key={bl.id}
                            type="button"
                            onClick={() => openEditBlockModal(bl)}
                            className="absolute left-1 right-1 z-[15] cursor-pointer overflow-hidden rounded-md border border-slate-300 bg-slate-200/90 px-1 py-0.5 text-left text-[10px] font-medium text-slate-700 hover:bg-slate-300/90"
                            style={{ top, height: h }}
                            title="Click to edit block"
                          >
                            Blocked{bl.reason ? `: ${bl.reason}` : ''}
                          </button>
                        );
                      })}

                      {clusterMultiServiceBookings(pracBookings).map((cluster) => {
                        if (cluster.kind === 'single') {
                          const b = cluster.booking;
                          const duration = getBookingDuration(b);
                          const colour = isArrivedWaitingDisplay(b) ? ARRIVED_WAITING_ACCENT_HEX : getBookingColour(b);
                          const statusStyle = bookingCalendarBlockStyle(b);
                          const svc = b.appointment_service_id ? serviceMap.get(b.appointment_service_id) : null;
                          const top = slotTop(b.booking_time);
                          const height = slotHeightFromDuration(duration);
                          const canDrag = ['Pending', 'Confirmed', 'Seated'].includes(b.status);
                          const flash = flashIds.has(b.id);
                          const qBusy = quickActionId === b.id;
                          const arrived = Boolean(b.client_arrived_at);
                          return (
                            <DraggableBookingShell key={b.id} booking={b} top={top} height={height} canDrag={canDrag}>
                              {(handle) => (
                                <div
                                  className={`flex h-full min-h-0 flex-row items-stretch overflow-hidden rounded-lg border shadow-sm transition-shadow hover:shadow-md ${statusStyle.bg} ${statusStyle.border} ${
                                    flash ? 'motion-safe:animate-pulse ring-2 ring-brand-400/60' : ''
                                  }`}
                                  style={{ borderLeftWidth: 3, borderLeftColor: colour }}
                                >
                                  {canDrag && handle.listeners && handle.attributes ? (
                                    <button
                                      type="button"
                                      className="w-5 shrink-0 cursor-grab touch-none border-r border-black/5 bg-black/[0.03] px-0.5 text-[10px] text-slate-400 hover:bg-black/[0.06] active:cursor-grabbing"
                                      aria-label="Drag to reschedule"
                                      {...handle.listeners}
                                      {...handle.attributes}
                                    >
                                      ⋮⋮
                                    </button>
                                  ) : null}
                                  <div className="flex min-h-0 min-w-0 flex-1 flex-row items-start gap-0">
                                    <button
                                      type="button"
                                      onClick={() => setDetailBookingId(b.id)}
                                      className="min-h-0 min-w-0 flex-1 px-1.5 py-1 text-left"
                                    >
                                      <div className="flex flex-wrap items-center gap-1">
                                        <span className={`truncate text-xs font-semibold ${statusStyle.text}`}>
                                          {b.guest_name}
                                        </span>
                                        {arrived && b.status !== 'Seated' && ['Pending', 'Confirmed'].includes(b.status) && (
                                          <span className="inline-flex h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-amber-500" aria-hidden title="Waiting" />
                                        )}
                                      </div>
                                      {svc && height > 36 && (
                                        <div className="truncate text-[10px] text-slate-500">{svc.name}</div>
                                      )}
                                      {height > 48 && (
                                        <div className="text-[10px] text-slate-400">
                                          {b.booking_time.slice(0, 5)} –{' '}
                                          {minutesToTime(timeToMinutes(b.booking_time) + duration)}
                                        </div>
                                      )}
                                    </button>
                                    <CalendarBookingQuickActions
                                      b={b}
                                      busy={qBusy}
                                      graceMinutes={noShowGraceMinutes}
                                      onStatus={(id, s) => void quickPatchBooking(id, { status: s })}
                                      onArrived={(id, v) => void quickPatchBooking(id, { client_arrived: v })}
                                    />
                                  </div>
                                </div>
                              )}
                            </DraggableBookingShell>
                          );
                        }

                        const items = cluster.items;
                        const first = items[0]!;
                        const last = items[items.length - 1]!;
                        const spanMins =
                          timeToMinutes(last.booking_time) +
                          getBookingDuration(last) -
                          timeToMinutes(first.booking_time);
                        const top = slotTop(first.booking_time);
                        const height = slotHeightFromDuration(spanMins);
                        const colour = isArrivedWaitingDisplay(first) ? ARRIVED_WAITING_ACCENT_HEX : getBookingColour(first);
                        const statusStyle = bookingCalendarBlockStyle(first);
                        const flash = items.some((x) => flashIds.has(x.id));
                        const qBusy = items.some((x) => quickActionId === x.id);
                        const arrived = Boolean(first.client_arrived_at);
                        const serviceTitle = items
                          .map((x) => (x.appointment_service_id ? serviceMap.get(x.appointment_service_id)?.name : null))
                          .filter(Boolean)
                          .join(' → ');
                        return (
                          <DraggableBookingShell key={first.id} booking={first} top={top} height={height} canDrag={false}>
                            {() => (
                              <div
                                className={`flex h-full min-h-0 flex-row items-stretch overflow-hidden rounded-lg border shadow-sm transition-shadow hover:shadow-md ${statusStyle.bg} ${statusStyle.border} ${
                                  flash ? 'motion-safe:animate-pulse ring-2 ring-brand-400/60' : ''
                                }`}
                                style={{ borderLeftWidth: 3, borderLeftColor: colour }}
                                title={serviceTitle || undefined}
                              >
                                <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                                  {items.map((b, segIdx) => {
                                    const dur = getBookingDuration(b);
                                    const svc = b.appointment_service_id ? serviceMap.get(b.appointment_service_id) : null;
                                    return (
                                      <div
                                        key={b.id}
                                        className={`flex min-h-0 flex-col border-t border-slate-500/25 first:border-t-0 ${statusStyle.bg}`}
                                        style={{ flex: dur }}
                                      >
                                        <button
                                          type="button"
                                          onClick={() => setDetailBookingId(b.id)}
                                          className="flex min-h-0 min-w-0 flex-1 flex-col px-1.5 py-0.5 text-left"
                                        >
                                          <div className="flex flex-wrap items-center gap-1">
                                            <span className={`truncate text-xs font-semibold ${statusStyle.text}`}>
                                              {segIdx === 0 ? b.guest_name : '\u00a0'}
                                            </span>
                                            {segIdx === 0 &&
                                              arrived &&
                                              first.status !== 'Seated' &&
                                              ['Pending', 'Confirmed'].includes(first.status) && (
                                                <span
                                                  className="inline-flex h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-amber-500"
                                                  aria-hidden
                                                  title="Waiting"
                                                />
                                              )}
                                          </div>
                                          {svc && (
                                            <div className="truncate text-[10px] text-slate-500">{svc.name}</div>
                                          )}
                                          <div className="text-[10px] text-slate-400">
                                            {b.booking_time.slice(0, 5)} –{' '}
                                            {minutesToTime(timeToMinutes(b.booking_time) + dur)}
                                          </div>
                                        </button>
                                      </div>
                                    );
                                  })}
                                </div>
                                <CalendarBookingQuickActions
                                  b={first}
                                  busy={qBusy}
                                  graceMinutes={noShowGraceMinutes}
                                  onStatus={(id, s) => void quickPatchBooking(id, { status: s })}
                                  onArrived={(id, v) => void quickPatchBooking(id, { client_arrived: v })}
                                />
                              </div>
                            )}
                          </DraggableBookingShell>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <DragOverlay dropAnimation={null}>
            {dragBooking ? (
              <DragBookingPreview booking={dragBooking} />
            ) : null}
          </DragOverlay>
        </DndContext>
        </div>
      )}

      {slotMenu && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-[55] cursor-default bg-transparent"
            aria-label="Close menu"
            onClick={() => setSlotMenu(null)}
          />
          <div
            className="fixed z-[60] w-44 rounded-xl border border-slate-200 bg-white py-1 shadow-xl"
            style={{ left: slotMenu.x, top: slotMenu.y }}
          >
            <button
              type="button"
              className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
              onClick={() => openNewAtSlot(slotMenu.pracId, slotMenu.dateStr, slotMenu.time)}
            >
              New appointment
            </button>
            <button
              type="button"
              className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
              onClick={() => openBlockModal(slotMenu.pracId, slotMenu.dateStr, slotMenu.time)}
            >
              Block time
            </button>
          </div>
        </>
      )}

      {blockModal && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
          onClick={() => setBlockModal(null)}
        >
          <div
            role="dialog"
            aria-labelledby="block-modal-title"
            className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="block-modal-title" className="text-base font-semibold text-slate-900">
              {blockModal.blockId ? 'Edit block' : 'Block time'}
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              {blockModal.dateStr} · {blockModal.startTime} – {blockModal.endTime}
              {blockModal.blockId ? ' (start time is fixed; adjust end time below)' : ''}
            </p>
            <div className="mt-4 space-y-3">
              <div>
                <label className="text-xs font-medium text-slate-600">End time</label>
                <input
                  type="time"
                  value={blockModal.endTime}
                  onChange={(e) => setBlockModal((m) => (m ? { ...m, endTime: e.target.value } : m))}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600">Reason (optional)</label>
                <input
                  type="text"
                  value={blockModal.reason}
                  onChange={(e) => setBlockModal((m) => (m ? { ...m, reason: e.target.value } : m))}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  placeholder="Lunch, training…"
                />
              </div>
            </div>
            <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
              {blockModal.blockId ? (
                <button
                  type="button"
                  disabled={blockSaving}
                  onClick={() => void deleteBlockFromModal()}
                  className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-100 disabled:opacity-50"
                >
                  Delete
                </button>
              ) : (
                <span />
              )}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setBlockModal(null)}
                  className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={blockSaving}
                  onClick={() => void saveBlock()}
                  className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
                >
                  {blockSaving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => {
          setPrefillDate(date);
          setPrefillTime(undefined);
          setPrefillPractitionerId(filterPractitioner === 'all' ? undefined : filterPractitioner);
          setShowNewAppointment(true);
        }}
        className="fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-brand-600 text-white shadow-lg hover:bg-brand-700 md:hidden"
        aria-label="New appointment"
      >
        <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
      </button>

      <AppointmentDetailSheet
        open={detailBookingId !== null}
        bookingId={detailBookingId}
        onClose={() => setDetailBookingId(null)}
        onUpdated={() => void fetchData({ silent: true })}
        currency={currency}
        practitioners={activePractitioners}
        prefetchedBooking={detailPrefetch}
        services={services.map((s) => ({
          id: s.id,
          name: s.name,
          duration_minutes: s.duration_minutes,
          colour: s.colour ?? '#6366f1',
          price_pence: s.price_pence ?? null,
        }))}
      />

      <AppointmentBookingForm
        open={showNewAppointment}
        onClose={() => {
          setShowNewAppointment(false);
          setPrefillTime(undefined);
        }}
        onCreated={() => {
          setShowNewAppointment(false);
          setPrefillTime(undefined);
          void fetchData({ silent: true });
        }}
        venueId={venueId}
        currency={currency}
        preselectedDate={prefillDate ?? (viewMode === 'day' ? date : undefined)}
        preselectedPractitionerId={prefillPractitionerId}
        preselectedTime={prefillTime}
      />
      <AppointmentWalkInModal
        open={showWalkIn}
        onClose={() => setShowWalkIn(false)}
        onCreated={() => {
          setShowWalkIn(false);
          void fetchData({ silent: true });
        }}
        currency={currency}
      />
    </div>
  );
}
