/**
 * Model E: Resource / facility booking availability engine.
 * Given resources + their availability hours + existing bookings,
 * returns available start times per resource for a requested duration.
 *
 * Resources are stored in `unified_calendars` with `calendar_type = 'resource'`.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ClassPaymentRequirement, VenueResource, WorkingHours } from '@/types/booking-models';
import { timeToMinutes, minutesToTime } from '@/lib/availability';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ResourceEngineInput {
  date: string;
  resources: VenueResource[];
  existingBookings: ResourceBooking[];
}

export interface ResourceBooking {
  id: string;
  resource_id: string;
  booking_time: string;     // "HH:mm"
  booking_end_time: string; // "HH:mm"
  status: string;
}

export interface ResourceSlot {
  resource_id: string;
  resource_name: string;
  start_time: string; // "HH:mm"
  price_per_slot_pence: number | null;
}

export interface ResourceAvailabilityResult {
  id: string;
  name: string;
  resource_type: string | null;
  min_booking_minutes: number;
  max_booking_minutes: number;
  slot_interval_minutes: number;
  price_per_slot_pence: number | null;
  payment_requirement: ClassPaymentRequirement;
  deposit_amount_pence: number | null;
  slots: ResourceSlot[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DAY_NAMES = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

/** Statuses that consume resource capacity (must match bookings query in fetchResourceInput). */
export const RESOURCE_BOOKING_CAPACITY_STATUSES = ['Confirmed', 'Pending', 'Seated'] as const;
const CAPACITY_CONSUMING_STATUSES = RESOURCE_BOOKING_CAPACITY_STATUSES as unknown as string[];

function dayKeyForDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dow = new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay();
  return String(dow);
}

function dayNameForDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dow = new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay();
  return DAY_NAMES[dow]!;
}

function getAvailabilityRanges(hours: WorkingHours, dateStr: string): Array<{ start: number; end: number }> {
  const dayKey = dayKeyForDate(dateStr);
  const dayName = dayNameForDate(dateStr);
  const ranges = hours[dayKey] ?? hours[dayName];
  if (!ranges || ranges.length === 0) return [];
  return ranges.map((r) => ({ start: timeToMinutes(r.start), end: timeToMinutes(r.end) }));
}

/** Working hours + days_off for the host calendar column (same key rules as resource availability). */
function getHostCalendarRanges(
  host: { working_hours: WorkingHours; days_off: string[] },
  dateStr: string,
): Array<{ start: number; end: number }> {
  const dayKey = dayKeyForDate(dateStr);
  const dayName = dayNameForDate(dateStr);
  if (Array.isArray(host.days_off)) {
    for (const d of host.days_off) {
      if (d === dateStr || d === dayName) return [];
    }
  }
  return getAvailabilityRanges(host.working_hours, dateStr);
}

function intersectRanges(
  a: Array<{ start: number; end: number }>,
  b: Array<{ start: number; end: number }>,
): Array<{ start: number; end: number }> {
  const out: Array<{ start: number; end: number }> = [];
  for (const x of a) {
    for (const y of b) {
      const s = Math.max(x.start, y.start);
      const e = Math.min(x.end, y.end);
      if (s < e) out.push({ start: s, end: e });
    }
  }
  return out;
}

/** Same rules as appointment `getBreakRanges` for a host calendar row. */
function getHostBreakRanges(
  host: {
    break_times: Array<{ start: string; end: string }>;
    break_times_by_day: WorkingHours | null | undefined;
  },
  dateStr: string,
): Array<{ start: number; end: number }> {
  const byDay = host.break_times_by_day;
  if (byDay && typeof byDay === 'object' && !Array.isArray(byDay) && Object.keys(byDay).length > 0) {
    const dayKey = dayKeyForDate(dateStr);
    const dayName = dayNameForDate(dateStr);
    const ranges = byDay[dayKey] ?? byDay[dayName];
    if (!ranges || !Array.isArray(ranges) || ranges.length === 0) return [];
    return ranges.map((b) => ({ start: timeToMinutes(b.start), end: timeToMinutes(b.end) }));
  }

  const breaks = host.break_times;
  if (!Array.isArray(breaks)) return [];
  return breaks.map((b) => ({ start: timeToMinutes(b.start), end: timeToMinutes(b.end) }));
}

function subtractOneRange(
  r: { start: number; end: number },
  cut: { start: number; end: number },
): Array<{ start: number; end: number }> {
  if (cut.end <= r.start || cut.start >= r.end) return [r];
  const out: Array<{ start: number; end: number }> = [];
  if (cut.start > r.start) {
    const segEnd = Math.min(cut.start, r.end);
    if (segEnd > r.start) out.push({ start: r.start, end: segEnd });
  }
  if (cut.end < r.end) {
    const segStart = Math.max(cut.end, r.start);
    if (r.end > segStart) out.push({ start: segStart, end: r.end });
  }
  return out;
}

function subtractRangesFromRanges(
  ranges: Array<{ start: number; end: number }>,
  toRemove: Array<{ start: number; end: number }>,
): Array<{ start: number; end: number }> {
  let result = ranges.filter((r) => r.end > r.start);
  for (const cut of toRemove) {
    if (cut.end <= cut.start) continue;
    const next: Array<{ start: number; end: number }> = [];
    for (const r of result) {
      next.push(...subtractOneRange(r, cut));
    }
    result = next;
  }
  return result;
}

/** Resource row only: exceptions and `availability_hours` (unified `working_hours` on resource). */
function getBaseResourceAvailabilityRanges(
  resource: VenueResource,
  dateStr: string,
): Array<{ start: number; end: number }> {
  const raw = resource.availability_exceptions;
  const ex = raw?.[dateStr];
  if (ex && 'closed' in ex && ex.closed === true) {
    return [];
  }
  if (ex && 'periods' in ex && Array.isArray(ex.periods) && ex.periods.length > 0) {
    return ex.periods.map((r) => ({ start: timeToMinutes(r.start), end: timeToMinutes(r.end) }));
  }
  return getAvailabilityRanges(resource.availability_hours, dateStr);
}

/**
 * Bookable windows for the resource on this date: resource row hours, intersected with the host
 * calendar column when `display_on_calendar_id` is set; host breaks are then carved out.
 */
function getEffectiveAvailabilityRanges(
  resource: VenueResource,
  dateStr: string,
): Array<{ start: number; end: number }> {
  const base = getBaseResourceAvailabilityRanges(resource, dateStr);
  if (!resource.display_on_calendar_id) return base;
  if (!resource.host_calendar) {
    return [];
  }
  const hostRanges = getHostCalendarRanges(resource.host_calendar, dateStr);
  let intersected = intersectRanges(base, hostRanges);
  const hostBreaks = getHostBreakRanges(resource.host_calendar, dateStr);
  if (hostBreaks.length > 0) {
    intersected = subtractRangesFromRanges(intersected, hostBreaks);
  }
  return intersected;
}

function overlaps(startA: number, endA: number, startB: number, endB: number): boolean {
  return startA < endB && startB < endA;
}

// ---------------------------------------------------------------------------
// Core engine
// ---------------------------------------------------------------------------

export function computeResourceAvailability(
  input: ResourceEngineInput,
  requestedDurationMinutes: number,
): ResourceAvailabilityResult[] {
  const { date, resources, existingBookings } = input;
  const results: ResourceAvailabilityResult[] = [];

  for (const resource of resources) {
    if (!resource.is_active) continue;

    const duration = Math.max(
      resource.min_booking_minutes,
      Math.min(requestedDurationMinutes, resource.max_booking_minutes),
    );

    const ranges = getEffectiveAvailabilityRanges(resource, date);
    if (ranges.length === 0) continue;

    const resourceBookings = existingBookings.filter(
      (b) => b.resource_id === resource.id && CAPACITY_CONSUMING_STATUSES.includes(b.status)
    );

    const slots: ResourceSlot[] = [];

    for (const range of ranges) {
      for (let t = range.start; t + duration <= range.end; t += resource.slot_interval_minutes) {
        const slotEnd = t + duration;

        const conflict = resourceBookings.some((b) => {
          const bStart = timeToMinutes(b.booking_time);
          const bEnd = timeToMinutes(b.booking_end_time);
          return overlaps(t, slotEnd, bStart, bEnd);
        });

        if (!conflict) {
          slots.push({
            resource_id: resource.id,
            resource_name: resource.name,
            start_time: minutesToTime(t),
            price_per_slot_pence: resource.price_per_slot_pence,
          });
        }
      }
    }

    results.push({
      id: resource.id,
      name: resource.name,
      resource_type: resource.resource_type,
      min_booking_minutes: resource.min_booking_minutes,
      max_booking_minutes: resource.max_booking_minutes,
      slot_interval_minutes: resource.slot_interval_minutes,
      price_per_slot_pence: resource.price_per_slot_pence,
      payment_requirement: resource.payment_requirement,
      deposit_amount_pence: resource.deposit_amount_pence,
      slots,
    });
  }

  return results;
}

/**
 * Dates in the given month (YYYY-MM-DD) where the resource has at least one bookable slot
 * for the requested duration (after min/max clamping inside the engine).
 */
export function computeResourceAvailableDatesInMonth(
  resource: VenueResource,
  year: number,
  month: number,
  durationMinutes: number,
  bookingsByDate: Map<string, ResourceBooking[]>,
): string[] {
  const pad = (n: number) => String(n).padStart(2, '0');
  const out: string[] = [];
  const lastDay = new Date(year, month, 0).getDate();
  for (let d = 1; d <= lastDay; d++) {
    const dateStr = `${year}-${pad(month)}-${pad(d)}`;
    const bookings = bookingsByDate.get(dateStr) ?? [];
    const input: ResourceEngineInput = {
      date: dateStr,
      resources: [resource],
      existingBookings: bookings,
    };
    const results = computeResourceAvailability(input, durationMinutes);
    const row = results.find((r) => r.id === resource.id);
    if (row && row.slots.length > 0) out.push(dateStr);
  }
  return out;
}

/**
 * Load bookings for one resource across a calendar month, grouped by booking_date.
 */
export async function fetchBookingsGroupedByDateForResourceMonth(
  supabase: SupabaseClient,
  venueId: string,
  resourceId: string,
  year: number,
  month: number,
): Promise<Map<string, ResourceBooking[]>> {
  const pad = (n: number) => String(n).padStart(2, '0');
  const monthStart = `${year}-${pad(month)}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const monthEnd = `${year}-${pad(month)}-${pad(lastDay)}`;

  const { data } = await supabase
    .from('bookings')
    .select('id, resource_id, calendar_id, booking_time, booking_end_time, status, booking_date')
    .eq('venue_id', venueId)
    .gte('booking_date', monthStart)
    .lte('booking_date', monthEnd)
    .or(`resource_id.eq.${resourceId},calendar_id.eq.${resourceId}`)
    .in('status', [...RESOURCE_BOOKING_CAPACITY_STATUSES]);

  const map = new Map<string, ResourceBooking[]>();
  for (const raw of data ?? []) {
    const b = raw as Record<string, unknown>;
    const bd = b.booking_date as string;
    const rid = (b.resource_id as string | null) ?? (b.calendar_id as string | null) ?? '';
    const rb: ResourceBooking = {
      id: b.id as string,
      resource_id: rid,
      booking_time: ((b.booking_time as string) ?? '00:00').slice(0, 5),
      booking_end_time: ((b.booking_end_time as string) ?? '00:00').slice(0, 5),
      status: b.status as string,
    };
    const list = map.get(bd) ?? [];
    list.push(rb);
    map.set(bd, list);
  }
  return map;
}

// ---------------------------------------------------------------------------
// Fetcher — reads from unified_calendars (calendar_type='resource')
// ---------------------------------------------------------------------------

/** Map a unified_calendars row to the VenueResource shape the engine expects. */
export function mapCalendarToResource(row: Record<string, unknown>): VenueResource {
  const payReq = row.payment_requirement as ClassPaymentRequirement | null | undefined;
  return {
    id: row.id as string,
    venue_id: row.venue_id as string,
    name: row.name as string,
    resource_type: (row.resource_type as string | null) ?? null,
    min_booking_minutes: (row.min_booking_minutes as number | null) ?? 60,
    max_booking_minutes: (row.max_booking_minutes as number | null) ?? 120,
    slot_interval_minutes: (row.slot_interval_minutes as number | null) ?? 30,
    price_per_slot_pence: (row.price_per_slot_pence as number | null) ?? null,
    payment_requirement: payReq ?? 'none',
    deposit_amount_pence: (row.deposit_amount_pence as number | null) ?? null,
    availability_hours: (row.working_hours as WorkingHours) ?? {},
    availability_exceptions: (row.availability_exceptions as VenueResource['availability_exceptions']) ?? undefined,
    is_active: (row.is_active as boolean | null) ?? true,
    sort_order: (row.sort_order as number | null) ?? 0,
    created_at: (row.created_at as string) ?? '',
    display_on_calendar_id: (row.display_on_calendar_id as string | null | undefined) ?? null,
    host_calendar: undefined,
  };
}

/**
 * Loads host `unified_calendars` rows and attaches `host_calendar` for resource availability intersection.
 */
export async function attachHostCalendarsToResources(
  supabase: SupabaseClient,
  venueId: string,
  resources: VenueResource[],
): Promise<VenueResource[]> {
  const ids = [...new Set(resources.map((r) => r.display_on_calendar_id).filter(Boolean))] as string[];
  if (ids.length === 0) {
    return resources.map((r) => ({ ...r, host_calendar: null }));
  }

  const { data, error } = await supabase
    .from('unified_calendars')
    .select('id, working_hours, days_off, break_times, break_times_by_day')
    .eq('venue_id', venueId)
    .in('id', ids);

  if (error) {
    console.warn('[attachHostCalendarsToResources] unified_calendars:', error.message);
  }

  const map = new Map(
    (data ?? []).map((row) => {
      const id = row.id as string;
      const breakTimes = row.break_times;
      const byDay = row.break_times_by_day;
      return [
        id,
        {
          id,
          working_hours: (row.working_hours as WorkingHours) ?? {},
          days_off: Array.isArray(row.days_off) ? (row.days_off as string[]) : [],
          break_times: Array.isArray(breakTimes)
            ? (breakTimes as Array<{ start: string; end: string }>)
            : [],
          break_times_by_day:
            byDay && typeof byDay === 'object' && !Array.isArray(byDay)
              ? (byDay as WorkingHours)
              : null,
        },
      ] as const;
    }),
  );

  return resources.map((r) => {
    if (!r.display_on_calendar_id) {
      return { ...r, host_calendar: null };
    }
    const host = map.get(r.display_on_calendar_id);
    return { ...r, host_calendar: host ?? null };
  });
}

export async function fetchResourceInput(params: {
  supabase: SupabaseClient;
  venueId: string;
  date: string;
  resourceId?: string;
}): Promise<ResourceEngineInput> {
  const { supabase, venueId, date, resourceId } = params;

  let resourcesQuery = supabase
    .from('unified_calendars')
    .select('*')
    .eq('venue_id', venueId)
    .eq('calendar_type', 'resource')
    .eq('is_active', true)
    .order('sort_order');
  if (resourceId) {
    resourcesQuery = resourcesQuery.eq('id', resourceId);
  }

  const [resourcesRes, bookingsRes] = await Promise.all([
    resourcesQuery,
    supabase
      .from('bookings')
      .select('id, resource_id, calendar_id, booking_time, booking_end_time, status')
      .eq('venue_id', venueId)
      .eq('booking_date', date)
      .or('resource_id.not.is.null,calendar_id.not.is.null')
      .in('status', CAPACITY_CONSUMING_STATUSES),
  ]);

  let resources = (resourcesRes.data ?? []).map((r) => mapCalendarToResource(r as Record<string, unknown>));
  resources = await attachHostCalendarsToResources(supabase, venueId, resources);
  const resourceIdSet = new Set(resources.map((r) => r.id));

  const existingBookings: ResourceBooking[] = (bookingsRes.data ?? [])
    .filter((b) => {
      const rid = (b as Record<string, unknown>).resource_id as string | null;
      const cid = (b as Record<string, unknown>).calendar_id as string | null;
      return (rid && resourceIdSet.has(rid)) || (cid && resourceIdSet.has(cid));
    })
    .map((b) => {
      const row = b as Record<string, unknown>;
      const rid = (row.resource_id as string | null) ?? (row.calendar_id as string | null) ?? '';
      return {
        id: row.id as string,
        resource_id: rid,
        booking_time: ((row.booking_time as string) ?? '00:00').slice(0, 5),
        booking_end_time: ((row.booking_end_time as string) ?? '00:00').slice(0, 5),
        status: row.status as string,
      };
    });

  return { date, resources, existingBookings };
}
