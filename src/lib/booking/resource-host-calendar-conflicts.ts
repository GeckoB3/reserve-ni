/**
 * When assigning a resource to a host team calendar, its weekly bookable hours must not overlap
 * existing class sessions, ticketed events, or other bookings on that same column during those hours.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { timeToMinutes } from '@/lib/availability';
import { classBlockEndTime, resolveInstructorCalendarIdForClass } from '@/lib/class-instances/instructor-calendar-block';
import { intervalOverlapsResourceWeeklyHours } from '@/lib/booking/resource-weekly-overlap';
import { BOOKING_ACTIVE_STATUSES } from '@/lib/table-management/constants';
import type { WorkingHours } from '@/types/booking-models';

function dayOfWeekFromIsoDate(iso: string): number {
  const part = iso.split('T')[0] ?? '';
  const [y, m, d] = part.split('-').map(Number);
  if (!y || !m || !d) return 0;
  return new Date(y, m - 1, d).getDay();
}

function bookingWindowEndMinutes(row: {
  booking_time: string;
  booking_end_time?: string | null;
  estimated_end_time?: string | null;
}): number {
  const start = timeToMinutes(String(row.booking_time).slice(0, 5));
  if (row.booking_end_time) return timeToMinutes(String(row.booking_end_time).slice(0, 5));
  if (row.estimated_end_time) return timeToMinutes(String(row.estimated_end_time).slice(0, 8));
  return start + 60;
}

/**
 * Returns an error message if the resource's weekly availability overlaps scheduled uses of the host calendar
 * at the same clock times (so guests could see conflicting slot offers).
 */
export async function assertResourceAvailabilityClearOnHostCalendar(
  admin: SupabaseClient,
  venueId: string,
  hostCalendarId: string,
  resourceWorkingHours: WorkingHours,
  options?: { excludeResourceId?: string },
): Promise<{ ok: true } | { ok: false; message: string }> {
  const excludeResourceId = options?.excludeResourceId;
  const today = new Date().toISOString().slice(0, 10);

  const { data: siblingRows, error: sibErr } = await admin
    .from('unified_calendars')
    .select('id')
    .eq('venue_id', venueId)
    .eq('calendar_type', 'resource')
    .eq('display_on_calendar_id', hostCalendarId);

  if (sibErr) {
    console.error('[assertResourceAvailabilityClearOnHostCalendar] siblings', sibErr.message);
    return { ok: false, message: 'Could not verify calendar bookings.' };
  }

  const siblingResourceIds = new Set((siblingRows ?? []).map((r: { id: string }) => r.id));

  const { data: typeRows, error: typeErr } = await admin
    .from('class_types')
    .select('id, instructor_id, duration_minutes, name')
    .eq('venue_id', venueId);

  if (typeErr) {
    console.error('[assertResourceAvailabilityClearOnHostCalendar] class_types', typeErr.message);
    return { ok: false, message: 'Could not verify class schedule.' };
  }

  const instructorCalCache = new Map<string | null, string | null>();
  async function calendarForInstructor(instructorId: string | null): Promise<string | null> {
    if (instructorId == null) return null;
    const hit = instructorCalCache.get(instructorId);
    if (hit !== undefined) return hit;
    const resolved = await resolveInstructorCalendarIdForClass(admin, venueId, instructorId);
    instructorCalCache.set(instructorId, resolved);
    return resolved;
  }

  const matchingClassTypeIds: string[] = [];
  const typeDuration = new Map<string, number>();
  const typeName = new Map<string, string>();
  for (const raw of typeRows ?? []) {
    const row = raw as { id: string; instructor_id: string | null; duration_minutes: number; name: string };
    const cal = await calendarForInstructor(row.instructor_id);
    if (cal === hostCalendarId) {
      matchingClassTypeIds.push(row.id);
      typeDuration.set(row.id, row.duration_minutes);
      typeName.set(row.id, row.name);
    }
  }

  if (matchingClassTypeIds.length > 0) {
    const { data: instRows, error: instErr } = await admin
      .from('class_instances')
      .select('id, instance_date, start_time, class_type_id')
      .eq('is_cancelled', false)
      .gte('instance_date', today)
      .in('class_type_id', matchingClassTypeIds);

    if (instErr) {
      console.error('[assertResourceAvailabilityClearOnHostCalendar] class_instances', instErr.message);
      return { ok: false, message: 'Could not verify class sessions.' };
    }

    for (const raw of instRows ?? []) {
      const row = raw as { instance_date: string; start_time: string; class_type_id: string };
      const dow = dayOfWeekFromIsoDate(row.instance_date);
      const dur = typeDuration.get(row.class_type_id) ?? 60;
      const startMins = timeToMinutes(String(row.start_time).slice(0, 5));
      const endStr = classBlockEndTime(row.start_time, dur);
      const endMins = timeToMinutes(endStr.slice(0, 5));
      if (
        intervalOverlapsResourceWeeklyHours(resourceWorkingHours, dow, startMins, endMins)
      ) {
        const label = typeName.get(row.class_type_id) ?? 'A class';
        return {
          ok: false,
          message: `${label} is scheduled on this calendar at a time that overlaps this resource’s weekly availability. Reschedule or cancel that session, or narrow the resource’s hours, before assigning it here.`,
        };
      }
    }
  }

  const bookingOrParts = [
    `calendar_id.eq.${hostCalendarId}`,
    `practitioner_id.eq.${hostCalendarId}`,
  ];
  const siblingList = [...siblingResourceIds];
  if (siblingList.length > 0) {
    bookingOrParts.push(`resource_id.in.(${siblingList.join(',')})`);
  }

  const { data: bookingRows, error: bkErr } = await admin
    .from('bookings')
    .select(
      'id, booking_date, booking_time, booking_end_time, estimated_end_time, status, calendar_id, practitioner_id, resource_id, class_instance_id, experience_event_id',
    )
    .eq('venue_id', venueId)
    .gte('booking_date', today)
    .or(bookingOrParts.join(','));

  if (bkErr) {
    console.error('[assertResourceAvailabilityClearOnHostCalendar] bookings', bkErr.message);
    return { ok: false, message: 'Could not verify existing bookings.' };
  }

  for (const raw of bookingRows ?? []) {
    const row = raw as {
      booking_date: string;
      booking_time: string;
      booking_end_time?: string | null;
      estimated_end_time?: string | null;
      status: string;
      calendar_id?: string | null;
      practitioner_id?: string | null;
      resource_id?: string | null;
      class_instance_id?: string | null;
      experience_event_id?: string | null;
    };
    if (!BOOKING_ACTIVE_STATUSES.includes(row.status as (typeof BOOKING_ACTIVE_STATUSES)[number])) continue;
    if (typeof row.resource_id === 'string' && excludeResourceId && row.resource_id === excludeResourceId) {
      continue;
    }

    const dow = dayOfWeekFromIsoDate(row.booking_date);
    const startMins = timeToMinutes(String(row.booking_time).slice(0, 5));
    const endMins = bookingWindowEndMinutes(row);
    if (intervalOverlapsResourceWeeklyHours(resourceWorkingHours, dow, startMins, endMins)) {
      if (row.class_instance_id) {
        return {
          ok: false,
          message:
            'This calendar already has a class booking during times when this resource is available to book. Resolve that session first, or narrow the resource’s weekly hours.',
        };
      }
      if (row.experience_event_id) {
        return {
          ok: false,
          message:
            'This calendar already has an event booking during times when this resource is available to book. Resolve that booking first, or narrow the resource’s weekly hours.',
        };
      }
      return {
        ok: false,
        message:
          'This calendar already has bookings during times when this resource is available to book. Resolve those bookings first, or narrow the resource’s weekly hours.',
      };
    }
  }

  const { data: evRows, error: evErr } = await admin
    .from('experience_events')
    .select('id, name, event_date, start_time, end_time')
    .eq('venue_id', venueId)
    .eq('calendar_id', hostCalendarId)
    .eq('is_active', true)
    .gte('event_date', today);

  if (evErr) {
    console.error('[assertResourceAvailabilityClearOnHostCalendar] experience_events', evErr.message);
    return { ok: false, message: 'Could not verify ticketed events.' };
  }

  for (const raw of evRows ?? []) {
    const row = raw as { name: string; event_date: string; start_time: string; end_time: string };
    const dow = dayOfWeekFromIsoDate(row.event_date);
    const startMins = timeToMinutes(String(row.start_time).slice(0, 5));
    const endMins = timeToMinutes(String(row.end_time).slice(0, 5));
    if (intervalOverlapsResourceWeeklyHours(resourceWorkingHours, dow, startMins, endMins)) {
      return {
        ok: false,
        message: `“${row.name}” is scheduled on this calendar at a time that overlaps this resource’s weekly availability. Reschedule or cancel that event, or narrow the resource’s hours, before assigning it here.`,
      };
    }
  }

  return { ok: true };
}
