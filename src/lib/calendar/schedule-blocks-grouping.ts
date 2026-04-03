import type { ScheduleBlockDTO } from '@/types/schedule-blocks';
import { inferBookingRowModel } from '@/lib/booking/infer-booking-row-model';

/**
 * Group blocks by `date` (YYYY-MM-DD), sorted by start_time within each day.
 * Used by week view (`WeekScheduleCdeStrip`) so each column only receives that day’s blocks.
 */
export function groupScheduleBlocksByDate(blocks: ScheduleBlockDTO[]): Map<string, ScheduleBlockDTO[]> {
  const m = new Map<string, ScheduleBlockDTO[]>();
  for (const b of blocks) {
    const arr = m.get(b.date) ?? [];
    arr.push(b);
    m.set(b.date, arr);
  }
  for (const [, arr] of m) {
    arr.sort((a, b) => a.start_time.localeCompare(b.start_time));
  }
  return m;
}

function formatLocalYYYYMMDD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Add calendar days in the user's local timezone.
 * Avoids UTC date shifts from `Date#toISOString().slice(0, 10)` around DST and non-UTC locales.
 */
export function addCalendarDays(isoDate: string, days: number): string {
  const d = new Date(isoDate + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return formatLocalYYYYMMDD(d);
}

function startOfMonth(date: string): string {
  return `${date.slice(0, 7)}-01`;
}

/**
 * Full 6-week month grid date range (matches PractitionerCalendarView monthCells),
 * so schedule API requests cover every visible cell.
 */
export function monthGridDateRange(monthAnchor: string): { from: string; to: string } {
  const som = startOfMonth(monthAnchor);
  const first = new Date(`${som}T12:00:00`);
  const startPad = first.getDay();
  const from = addCalendarDays(som, -startPad);
  const to = addCalendarDays(from, 41);
  return { from, to };
}

export type ScheduleModelFilter = 'all' | 'appointments' | 'event_ticket' | 'class_session' | 'resource_booking';

export function filterScheduleBlocksByModel(
  blocks: ScheduleBlockDTO[],
  filter: ScheduleModelFilter,
): ScheduleBlockDTO[] {
  if (filter === 'all') return blocks;
  if (filter === 'appointments') return [];
  return blocks.filter((b) => b.kind === filter);
}

/** Bookings that render on the practitioner grid (unified / legacy appointment). */
export function isPractitionerGridBooking(row: {
  experience_event_id?: string | null;
  class_instance_id?: string | null;
  resource_id?: string | null;
  event_session_id?: string | null;
  calendar_id?: string | null;
  service_item_id?: string | null;
  practitioner_id?: string | null;
  appointment_service_id?: string | null;
}): boolean {
  const m = inferBookingRowModel(row);
  return m === 'unified_scheduling' || m === 'practitioner_appointment';
}

export interface MonthDayScheduleCounts {
  appointments: number;
  event_ticket: number;
  class_session: number;
  resource_booking: number;
}

/**
 * Per-day counts for month grid: practitioner/unified bookings (`isPractitionerGridBooking`) + schedule blocks by kind.
 * Appointments use infer rules only so C/D/E that also appear as schedule blocks are not double-counted in the blue lane.
 * Each `scheduleBlocks` entry is counted only when `bl.date` is in `datesInGrid` (per calendar cell).
 */
export function buildMonthDayScheduleCounts(
  bookings: Array<{
    booking_date: string;
    status: string;
    experience_event_id?: string | null;
    class_instance_id?: string | null;
    resource_id?: string | null;
    event_session_id?: string | null;
    calendar_id?: string | null;
    service_item_id?: string | null;
    practitioner_id?: string | null;
    appointment_service_id?: string | null;
  }>,
  scheduleBlocks: ScheduleBlockDTO[],
  datesInGrid: string[],
  scheduleModelFilter: ScheduleModelFilter = 'all',
): Record<string, MonthDayScheduleCounts> {
  const out: Record<string, MonthDayScheduleCounts> = {};
  const dateSet = new Set(datesInGrid);
  for (const d of datesInGrid) {
    out[d] = { appointments: 0, event_ticket: 0, class_session: 0, resource_booking: 0 };
  }

  const countAppt = scheduleModelFilter === 'all' || scheduleModelFilter === 'appointments';
  const countEv = scheduleModelFilter === 'all' || scheduleModelFilter === 'event_ticket';
  const countCl = scheduleModelFilter === 'all' || scheduleModelFilter === 'class_session';
  const countRes = scheduleModelFilter === 'all' || scheduleModelFilter === 'resource_booking';

  for (const b of bookings) {
    if (!dateSet.has(b.booking_date)) continue;
    if (b.status === 'Cancelled' || b.status === 'No-Show') continue;
    if (countAppt && isPractitionerGridBooking(b)) {
      out[b.booking_date]!.appointments += 1;
    }
  }

  for (const bl of scheduleBlocks) {
    if (!dateSet.has(bl.date)) continue;
    if (bl.status === 'Cancelled') continue;
    const k = bl.kind;
    if (k === 'event_ticket' && countEv) out[bl.date]!.event_ticket += 1;
    else if (k === 'class_session' && countCl) out[bl.date]!.class_session += 1;
    else if (k === 'resource_booking' && countRes) out[bl.date]!.resource_booking += 1;
  }

  return out;
}
