/**
 * Model B: Practitioner appointment availability engine.
 * Pure functions — given practitioners, services, and existing bookings,
 * returns available appointment start times per practitioner.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Practitioner, AppointmentService, PractitionerService } from '@/types/booking-models';
import { timeToMinutes, minutesToTime } from '@/lib/availability';
import { getDayOfWeek } from '@/lib/availability/engine';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PhantomBooking {
  practitioner_id: string;
  start_time: string;         // "HH:mm"
  duration_minutes: number;
  buffer_minutes: number;
}

/** Staff blocks on the practitioner calendar (breaks / blocked time). Minutes from midnight. */
export interface PractitionerCalendarBlockedRange {
  practitioner_id: string;
  start: number;
  end: number;
}

export interface AppointmentEngineInput {
  date: string; // "YYYY-MM-DD"
  practitioners: Practitioner[];
  services: AppointmentService[];
  practitionerServices: PractitionerService[];
  existingBookings: AppointmentBooking[];
  phantomBookings?: PhantomBooking[];
  practitionerBlockedRanges?: PractitionerCalendarBlockedRange[];
  /**
   * When true, do not hide today's slots before the current clock time.
   * Used for staff reschedule validation — the guest booking may move to a time
   * that is already "past" relative to when staff edit (same-day corrections).
   */
  skipPastSlotFilter?: boolean;
}

export interface AppointmentBooking {
  id: string;
  practitioner_id: string;
  booking_time: string;       // "HH:mm"
  duration_minutes: number;
  buffer_minutes: number;
  status: string;
}

export interface PractitionerSlot {
  practitioner_id: string;
  practitioner_name: string;
  service_id: string;
  service_name: string;
  start_time: string;         // "HH:mm"
  duration_minutes: number;
  price_pence: number | null;
}

export interface AppointmentAvailabilityResult {
  practitioners: Array<{
    id: string;
    name: string;
    services: Array<{
      id: string;
      name: string;
      duration_minutes: number;
      price_pence: number | null;
      deposit_pence: number | null;
    }>;
    slots: PractitionerSlot[];
  }>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DAY_NAMES = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

/** Align with dashboard working-hours keys (JS getDay, 0=Sun) — same as getDayOfWeek() in engine.ts. */
function dayKeyForDate(dateStr: string): string {
  return String(getDayOfWeek(dateStr));
}

function dayNameForDate(dateStr: string): string {
  const dow = getDayOfWeek(dateStr);
  return DAY_NAMES[dow]!;
}

function getWorkingRanges(practitioner: Practitioner, dateStr: string): Array<{ start: number; end: number }> {
  const dayKey = dayKeyForDate(dateStr);
  const dayName = dayNameForDate(dateStr);

  // Check specific date days-off
  if (Array.isArray(practitioner.days_off)) {
    for (const d of practitioner.days_off) {
      if (d === dateStr || d === dayName) return [];
    }
  }

  const hours = practitioner.working_hours as Record<string, Array<{ start: string; end: string }>>;
  const ranges = hours[dayKey] ?? hours[dayName];
  if (!ranges || ranges.length === 0) return [];

  return ranges.map((r) => ({ start: timeToMinutes(r.start), end: timeToMinutes(r.end) }));
}

function getBreakRanges(practitioner: Practitioner): Array<{ start: number; end: number }> {
  const breaks = practitioner.break_times as Array<{ start: string; end: string }>;
  if (!Array.isArray(breaks)) return [];
  return breaks.map((b) => ({ start: timeToMinutes(b.start), end: timeToMinutes(b.end) }));
}

function overlaps(startA: number, endA: number, startB: number, endB: number): boolean {
  return startA < endB && startB < endA;
}

const CAPACITY_CONSUMING_STATUSES = ['Confirmed', 'Pending', 'Seated'];

// ---------------------------------------------------------------------------
// Core engine
// ---------------------------------------------------------------------------

export function computeAppointmentAvailability(input: AppointmentEngineInput, nowMinutes?: number): AppointmentAvailabilityResult {
  const {
    date,
    practitioners,
    services,
    practitionerServices,
    existingBookings,
    phantomBookings = [],
    practitionerBlockedRanges = [],
    skipPastSlotFilter = false,
  } = input;
  const serviceMap = new Map(services.map((s) => [s.id, s]));

  // Determine the earliest bookable minute for today (past slots are unavailable)
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const isToday = date === todayStr;
  const currentMinute = nowMinutes ?? (now.getHours() * 60 + now.getMinutes());

  const result: AppointmentAvailabilityResult = { practitioners: [] };

  for (const practitioner of practitioners) {
    if (!practitioner.is_active) continue;

    const workingRanges = getWorkingRanges(practitioner, date);
    if (workingRanges.length === 0) continue;

    const breakRanges = getBreakRanges(practitioner);

    const practitionerBookings = existingBookings.filter(
      (b) => b.practitioner_id === practitioner.id && CAPACITY_CONSUMING_STATUSES.includes(b.status)
    );

    const practitionerPhantoms = phantomBookings.filter(
      (p) => p.practitioner_id === practitioner.id
    );

    const dayBlocks = practitionerBlockedRanges.filter((b) => b.practitioner_id === practitioner.id);

    const allLinksForPractitioner = practitionerServices.filter((ps) => ps.practitioner_id === practitioner.id);
    const linkedServices = allLinksForPractitioner
      .map((ps) => {
        const svc = serviceMap.get(ps.service_id);
        if (!svc || !svc.is_active) return null;
        return {
          ...svc,
          duration_minutes: ps.custom_duration_minutes ?? svc.duration_minutes,
          price_pence: ps.custom_price_pence ?? svc.price_pence,
        };
      })
      .filter(Boolean) as AppointmentService[];

    // Only fall back to all services when practitioner has zero configured links (unconfigured venue).
    // If they have links but none match the queried services, they genuinely don't offer them.
    const offeredServices = allLinksForPractitioner.length > 0 ? linkedServices : services.filter((s) => s.is_active);

    const allSlots: PractitionerSlot[] = [];
    const practitionerServiceList: Array<{
      id: string;
      name: string;
      duration_minutes: number;
      price_pence: number | null;
      deposit_pence: number | null;
    }> = [];

    for (const svc of offeredServices) {
      const totalDuration = svc.duration_minutes + svc.buffer_minutes;
      const serviceSlots: PractitionerSlot[] = [];

      practitionerServiceList.push({
        id: svc.id,
        name: svc.name,
        duration_minutes: svc.duration_minutes,
        price_pence: svc.price_pence,
        deposit_pence: svc.deposit_pence,
      });

      for (const range of workingRanges) {
        for (let t = range.start; t + totalDuration <= range.end; t += 15) {
          // Skip slots in the past for today (guest booking flow only)
          if (isToday && t < currentMinute && !skipPastSlotFilter) continue;

          const slotEnd = t + totalDuration;

          // Check breaks
          const hitsBreak = breakRanges.some((b) => overlaps(t, slotEnd, b.start, b.end));
          if (hitsBreak) continue;

          // Staff calendar blocks (blocked time ranges)
          const hitsCalendarBlock = dayBlocks.some((b) => overlaps(t, slotEnd, b.start, b.end));
          if (hitsCalendarBlock) continue;

          // Check existing bookings
          const hitsBooking = practitionerBookings.some((b) => {
            const bStart = timeToMinutes(b.booking_time);
            const bEnd = bStart + b.duration_minutes + b.buffer_minutes;
            return overlaps(t, slotEnd, bStart, bEnd);
          });
          if (hitsBooking) continue;

          // Check phantom bookings (already-selected slots in a group booking)
          const hitsPhantom = practitionerPhantoms.some((p) => {
            const pStart = timeToMinutes(p.start_time);
            const pEnd = pStart + p.duration_minutes + p.buffer_minutes;
            return overlaps(t, slotEnd, pStart, pEnd);
          });
          if (hitsPhantom) continue;

          serviceSlots.push({
            practitioner_id: practitioner.id,
            practitioner_name: practitioner.name,
            service_id: svc.id,
            service_name: svc.name,
            start_time: minutesToTime(t),
            duration_minutes: svc.duration_minutes,
            price_pence: svc.price_pence,
          });
        }
      }

      allSlots.push(...serviceSlots);
    }

    if (allSlots.length > 0 || offeredServices.length > 0) {
      result.practitioners.push({
        id: practitioner.id,
        name: practitioner.name,
        services: practitionerServiceList,
        slots: allSlots,
      });
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Fetcher
// ---------------------------------------------------------------------------

export async function fetchAppointmentInput(params: {
  supabase: SupabaseClient;
  venueId: string;
  date: string;
  practitionerId?: string;
  serviceId?: string;
}): Promise<AppointmentEngineInput> {
  const { supabase, venueId, date, practitionerId, serviceId } = params;

  let practitionerQuery = supabase
    .from('practitioners')
    .select('*')
    .eq('venue_id', venueId)
    .eq('is_active', true)
    .order('sort_order');
  if (practitionerId) {
    practitionerQuery = practitionerQuery.eq('id', practitionerId);
  }

  const [practitionersRes, allServicesRes, psRes, bookingsRes, blocksRes] = await Promise.all([
    practitionerQuery,
    supabase
      .from('appointment_services')
      .select('*')
      .eq('venue_id', venueId)
      .eq('is_active', true)
      .order('sort_order'),
    supabase.from('practitioner_services').select('*, practitioners!inner(venue_id)').eq('practitioners.venue_id', venueId),
    supabase
      .from('bookings')
      .select('id, practitioner_id, booking_time, appointment_service_id, status')
      .eq('venue_id', venueId)
      .eq('booking_date', date)
      .not('practitioner_id', 'is', null)
      .in('status', CAPACITY_CONSUMING_STATUSES),
    supabase
      .from('practitioner_calendar_blocks')
      .select('practitioner_id, start_time, end_time')
      .eq('venue_id', venueId)
      .eq('block_date', date),
  ]);

  const practitioners = (practitionersRes.data ?? []) as Practitioner[];
  const allServices = (allServicesRes.data ?? []) as AppointmentService[];
  const services = serviceId ? allServices.filter((s) => s.id === serviceId) : allServices;
  const practitionerServices = (psRes.data ?? []) as PractitionerService[];
  const serviceMapForBookings = new Map(allServices.map((s) => [s.id, s]));

  const existingBookings: AppointmentBooking[] = (bookingsRes.data ?? []).map((b) => {
    const sid = b.appointment_service_id as string | null;
    const svc = sid ? serviceMapForBookings.get(sid) : null;
    const ps = sid
      ? practitionerServices.find((row) => row.practitioner_id === b.practitioner_id && row.service_id === sid)
      : undefined;
    const durationMinutes =
      ps?.custom_duration_minutes != null ? ps.custom_duration_minutes : (svc?.duration_minutes ?? 30);
    return {
      id: b.id,
      practitioner_id: b.practitioner_id!,
      booking_time: (b.booking_time as string).slice(0, 5),
      duration_minutes: durationMinutes,
      buffer_minutes: svc?.buffer_minutes ?? 0,
      status: b.status,
    };
  });

  const practitionerBlockedRanges: PractitionerCalendarBlockedRange[] = blocksRes.error
    ? []
    : (blocksRes.data ?? [])
        .map((row: { practitioner_id: string; start_time: string; end_time: string }) => ({
          practitioner_id: row.practitioner_id,
          start: timeToMinutes(String(row.start_time).slice(0, 5)),
          end: timeToMinutes(String(row.end_time).slice(0, 5)),
        }))
        .filter((b) => b.end > b.start);

  if (blocksRes.error) {
    console.warn('[fetchAppointmentInput] practitioner_calendar_blocks:', blocksRes.error.message);
  }

  return { date, practitioners, services, practitionerServices, existingBookings, practitionerBlockedRanges };
}
