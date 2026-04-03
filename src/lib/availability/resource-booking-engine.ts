/**
 * Model E: Resource / facility booking availability engine.
 * Given resources + their availability hours + existing bookings,
 * returns available start times per resource for a requested duration.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { VenueResource, WorkingHours } from '@/types/booking-models';
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
  slots: ResourceSlot[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DAY_NAMES = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
const CAPACITY_CONSUMING_STATUSES = ['Confirmed', 'Pending', 'Seated'];

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

function getEffectiveAvailabilityRanges(
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
      slots,
    });
  }

  return results;
}

// ---------------------------------------------------------------------------
// Fetcher
// ---------------------------------------------------------------------------

export async function fetchResourceInput(params: {
  supabase: SupabaseClient;
  venueId: string;
  date: string;
  resourceId?: string;
}): Promise<ResourceEngineInput> {
  const { supabase, venueId, date, resourceId } = params;

  let resourcesQuery = supabase
    .from('venue_resources')
    .select('*')
    .eq('venue_id', venueId)
    .eq('is_active', true)
    .order('sort_order');
  if (resourceId) {
    resourcesQuery = resourcesQuery.eq('id', resourceId);
  }

  const [resourcesRes, bookingsRes] = await Promise.all([
    resourcesQuery,
    supabase
      .from('bookings')
      .select('id, resource_id, booking_time, booking_end_time, status')
      .eq('venue_id', venueId)
      .eq('booking_date', date)
      .not('resource_id', 'is', null)
      .in('status', CAPACITY_CONSUMING_STATUSES),
  ]);

  const resources = (resourcesRes.data ?? []) as VenueResource[];

  const existingBookings: ResourceBooking[] = (bookingsRes.data ?? []).map((b) => ({
    id: b.id,
    resource_id: b.resource_id!,
    booking_time: (b.booking_time as string).slice(0, 5),
    booking_end_time: (b.booking_end_time as string)?.slice(0, 5) ?? '00:00',
    status: b.status,
  }));

  return { date, resources, existingBookings };
}
