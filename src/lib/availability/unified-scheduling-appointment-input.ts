/**
 * Canonical appointment engine input for `unified_scheduling` venues:
 * unified_calendars + service_items + calendar_service_assignments (+ calendar_blocks).
 * Does not read practitioners / appointment_services / practitioner_services.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Practitioner, AppointmentService, PractitionerService } from '@/types/booking-models';
import { mergeAppointmentServiceWithPractitionerLink } from '@/lib/appointments/merge-service-with-overrides';
import type { OpeningHours } from '@/types/availability';
import { timeToMinutes } from '@/lib/availability';
import type {
  AppointmentEngineInput,
  AppointmentBooking,
  PractitionerCalendarBlockedRange,
} from '@/lib/availability/appointment-engine';
import { unifiedCalendarRowToPractitioner } from '@/lib/availability/unified-calendar-mapper';

const CAPACITY_STATUSES = ['Confirmed', 'Pending', 'Seated'];

function serviceItemToAppointmentService(row: Record<string, unknown>): AppointmentService {
  return {
    id: row.id as string,
    venue_id: row.venue_id as string,
    name: row.name as string,
    description: (row.description as string | null) ?? null,
    duration_minutes: row.duration_minutes as number,
    buffer_minutes: (row.buffer_minutes as number) ?? 0,
    processing_time_minutes: (row.processing_time_minutes as number) ?? 0,
    price_pence: (row.price_pence as number | null) ?? null,
    deposit_pence: (row.deposit_pence as number | null) ?? null,
    colour: (row.colour as string) ?? '#3B82F6',
    is_active: row.is_active !== false,
    sort_order: (row.sort_order as number) ?? 0,
    created_at: (row.created_at as string) ?? new Date().toISOString(),
  };
}

export async function fetchUnifiedSchedulingAppointmentInput(params: {
  supabase: SupabaseClient;
  venueId: string;
  date: string;
  practitionerId?: string;
  serviceId?: string;
}): Promise<AppointmentEngineInput> {
  const { supabase, venueId, date, practitionerId, serviceId } = params;

  let calQuery = supabase
    .from('unified_calendars')
    .select('*')
    .eq('venue_id', venueId)
    .eq('is_active', true)
    .order('sort_order');
  if (practitionerId) {
    calQuery = calQuery.eq('id', practitionerId);
  }

  const { data: calendarRows, error: calErr } = await calQuery;
  if (calErr) {
    console.warn('[fetchUnifiedSchedulingAppointmentInput] unified_calendars:', calErr.message);
  }
  const calendars = (calendarRows ?? []) as Record<string, unknown>[];
  if (calendars.length === 0) {
    return {
      date,
      practitioners: [],
      services: [],
      practitionerServices: [],
      existingBookings: [],
      practitionerBlockedRanges: [],
      venueOpeningHours: null,
    };
  }

  const calendarIds = calendars.map((c) => c.id as string);

  const { data: assignRows } = await supabase
    .from('calendar_service_assignments')
    .select('id, calendar_id, service_item_id, custom_duration_minutes, custom_price_pence')
    .in('calendar_id', calendarIds);

  const assignments = assignRows ?? [];

  const { data: serviceRows } = await supabase
    .from('service_items')
    .select('*')
    .eq('venue_id', venueId)
    .eq('is_active', true)
    .order('sort_order');

  const allServices = (serviceRows ?? []).map((r) => serviceItemToAppointmentService(r as Record<string, unknown>));
  const services = serviceId ? allServices.filter((s) => s.id === serviceId) : allServices;

  const practitioners: Practitioner[] = calendars.map((row) => unifiedCalendarRowToPractitioner(row));

  const practitionerServices: PractitionerService[] = assignments.map((a) => {
    const row = a as {
      id: string;
      calendar_id: string;
      service_item_id: string;
      custom_duration_minutes: number | null;
      custom_price_pence: number | null;
    };
    return {
      id: row.id,
      practitioner_id: row.calendar_id,
      service_id: row.service_item_id,
      custom_duration_minutes: row.custom_duration_minutes,
      custom_price_pence: row.custom_price_pence,
    };
  });

  const idList = calendarIds.join(',');
  let bookingsQuery = supabase
    .from('bookings')
    .select('id, practitioner_id, calendar_id, booking_time, appointment_service_id, service_item_id, status')
    .eq('venue_id', venueId)
    .eq('booking_date', date)
    .in('status', CAPACITY_STATUSES);
  if (practitionerId) {
    bookingsQuery = bookingsQuery.or(
      `calendar_id.eq.${practitionerId},practitioner_id.eq.${practitionerId}`,
    );
  } else {
    bookingsQuery = bookingsQuery.or(`calendar_id.in.(${idList}),practitioner_id.in.(${idList})`);
  }

  const [
    bookingsRes,
    blocksLegacyRes,
    blocksCalRes,
    leaveRes,
    venueRes,
  ] = await Promise.all([
    bookingsQuery,
    supabase
      .from('practitioner_calendar_blocks')
      .select('practitioner_id, start_time, end_time')
      .eq('venue_id', venueId)
      .eq('block_date', date)
      .in('practitioner_id', calendarIds),
    supabase
      .from('calendar_blocks')
      .select('calendar_id, start_time, end_time')
      .eq('venue_id', venueId)
      .eq('block_date', date)
      .in('calendar_id', calendarIds),
    supabase
      .from('practitioner_leave_periods')
      .select('practitioner_id')
      .eq('venue_id', venueId)
      .lte('start_date', date)
      .gte('end_date', date),
    supabase.from('venues').select('opening_hours').eq('id', venueId).single(),
  ]);

  const serviceMapForBookings = new Map(allServices.map((s) => [s.id, s]));
  const assignByCalSvc = new Map(
    practitionerServices.map((ps) => [`${ps.practitioner_id}|${ps.service_id}`, ps]),
  );

  const existingBookings: AppointmentBooking[] = (bookingsRes.data ?? []).flatMap((b) => {
    const row = b as {
      practitioner_id: string | null;
      calendar_id?: string | null;
      appointment_service_id: string | null;
      service_item_id: string | null;
    };
    const sid = (row.service_item_id ?? row.appointment_service_id) as string | null;
    const svc = sid ? serviceMapForBookings.get(sid) : null;
    const practKey = (row.calendar_id ?? row.practitioner_id) as string | null;
    if (!practKey) return [];
    const ps = sid ? assignByCalSvc.get(`${practKey}|${sid}`) : undefined;
    const merged = svc ? mergeAppointmentServiceWithPractitionerLink(svc, ps) : null;
    return [
      {
        id: b.id as string,
        practitioner_id: practKey,
        booking_time: (b.booking_time as string).slice(0, 5),
        duration_minutes: merged?.duration_minutes ?? 30,
        buffer_minutes: merged?.buffer_minutes ?? 0,
        processing_time_minutes: merged?.processing_time_minutes ?? 0,
        status: b.status as string,
      },
    ];
  });

  const practitionerBlockedRanges: PractitionerCalendarBlockedRange[] = [];

  if (!blocksLegacyRes.error && blocksLegacyRes.data) {
    for (const row of blocksLegacyRes.data as Array<{
      practitioner_id: string;
      start_time: string;
      end_time: string;
    }>) {
      const start = timeToMinutes(String(row.start_time).slice(0, 5));
      const end = timeToMinutes(String(row.end_time).slice(0, 5));
      if (end > start) {
        practitionerBlockedRanges.push({
          practitioner_id: row.practitioner_id,
          start,
          end,
        });
      }
    }
  }

  if (!blocksCalRes.error && blocksCalRes.data) {
    for (const row of blocksCalRes.data as Array<{
      calendar_id: string;
      start_time: string;
      end_time: string;
    }>) {
      const start = timeToMinutes(String(row.start_time).slice(0, 5));
      const end = timeToMinutes(String(row.end_time).slice(0, 5));
      if (end > start) {
        practitionerBlockedRanges.push({
          practitioner_id: row.calendar_id,
          start,
          end,
        });
      }
    }
  }

  if (!leaveRes.error && leaveRes.data?.length) {
    const onLeaveIds = new Set(
      (leaveRes.data as Array<{ practitioner_id: string }>).map((r) => r.practitioner_id),
    );
    for (let i = 0; i < practitioners.length; i++) {
      const p = practitioners[i]!;
      if (!onLeaveIds.has(p.id)) continue;
      const existing = Array.isArray(p.days_off) ? [...p.days_off] : [];
      if (!existing.includes(date)) existing.push(date);
      practitioners[i] = { ...p, days_off: existing };
    }
  } else if (leaveRes.error) {
    console.warn('[fetchUnifiedSchedulingAppointmentInput] practitioner_leave_periods:', leaveRes.error.message);
  }

  const venueOpeningHours = venueRes.error
    ? null
    : ((venueRes.data?.opening_hours as OpeningHours | null) ?? null);

  return {
    date,
    practitioners,
    services,
    practitionerServices,
    existingBookings,
    practitionerBlockedRanges,
    venueOpeningHours,
  };
}
