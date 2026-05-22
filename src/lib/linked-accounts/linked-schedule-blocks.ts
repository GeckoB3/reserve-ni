import type { SupabaseClient } from '@supabase/supabase-js';
import { timeToMinutes, minutesToTime } from '@/lib/availability';
import { resolveInstructorCalendarIdForClass } from '@/lib/class-instances/instructor-calendar-block';
import type { ScheduleBlockDTO } from '@/types/schedule-blocks';

function hhmm(t: string | null | undefined): string {
  if (!t) return '09:00';
  const s = String(t);
  return s.length >= 5 ? s.slice(0, 5) : s;
}

type RawBookingRow = {
  experience_event_id?: string | null;
  class_instance_id?: string | null;
  status?: string | null;
  party_size?: number | null;
};

/**
 * Event/class schedule blocks for a linked owner venue (mirrors GET /api/venue/schedule
 * occurrence shells). Only emitted for full_details links so time_only grants never
 * leak event or class titles.
 */
export async function buildLinkedVenueScheduleBlocks(
  admin: SupabaseClient,
  venueId: string,
  fromStr: string,
  toStr: string,
  rawBookings: RawBookingRow[],
  columnIds: ReadonlySet<string>,
): Promise<ScheduleBlockDTO[]> {
  const blocks: ScheduleBlockDTO[] = [];

  const eventStats = new Map<string, { bookingCount: number; partyTotal: number }>();
  const classEnrolledByInstance = new Map<string, number>();
  const bookedClassIds = new Set<string>();

  for (const r of rawBookings) {
    if (r.status === 'Cancelled') continue;
    if (r.experience_event_id) {
      const eid = r.experience_event_id;
      const cur = eventStats.get(eid) ?? { bookingCount: 0, partyTotal: 0 };
      cur.bookingCount += 1;
      cur.partyTotal += Number(r.party_size ?? 1);
      eventStats.set(eid, cur);
    }
    if (r.class_instance_id) {
      bookedClassIds.add(r.class_instance_id);
      classEnrolledByInstance.set(
        r.class_instance_id,
        (classEnrolledByInstance.get(r.class_instance_id) ?? 0) + Number(r.party_size ?? 1),
      );
    }
  }

  const { data: evRows } = await admin
    .from('experience_events')
    .select('id, name, event_date, start_time, end_time, calendar_id, capacity')
    .eq('venue_id', venueId)
    .eq('is_active', true)
    .gte('event_date', fromStr)
    .lte('event_date', toStr);

  for (const ev of evRows ?? []) {
    const e = ev as {
      id: string;
      name: string;
      event_date: string;
      start_time: string;
      end_time: string;
      calendar_id: string | null;
      capacity: number;
    };
    const calId = e.calendar_id ?? null;
    if (calId && !columnIds.has(calId)) continue;

    const st = eventStats.get(e.id);
    const bookingCount = st?.bookingCount ?? 0;
    const partyTotal = st?.partyTotal ?? 0;
    const subtitle =
      bookingCount === 0
        ? 'No bookings yet'
        : `${bookingCount} booking${bookingCount === 1 ? '' : 's'} · ${partyTotal} guest${partyTotal === 1 ? '' : 's'}`;

    blocks.push({
      id: `ev-${e.id}`,
      kind: 'event_ticket',
      date: e.event_date,
      start_time: hhmm(e.start_time),
      end_time: hhmm(e.end_time),
      title: e.name,
      subtitle,
      accent_colour: '#F59E0B',
      experience_event_id: e.id,
      calendar_id: calId,
      event_capacity: e.capacity ?? null,
      event_booking_count: bookingCount,
      event_party_total: partyTotal,
    });
  }

  const { data: ctRows } = await admin
    .from('class_types')
    .select('id')
    .eq('venue_id', venueId)
    .eq('is_active', true);
  const ctIds = (ctRows ?? []).map((x: { id: string }) => x.id);
  if (ctIds.length === 0) {
    blocks.sort((a, b) => a.date.localeCompare(b.date) || a.start_time.localeCompare(b.start_time));
    return blocks;
  }

  const { data: ciRows } = await admin
    .from('class_instances')
    .select('id, instance_date, start_time, class_type_id, capacity_override')
    .in('class_type_id', ctIds)
    .eq('is_cancelled', false)
    .gte('instance_date', fromStr)
    .lte('instance_date', toStr);

  const needTypeIds = [...new Set((ciRows ?? []).map((r: { class_type_id: string }) => r.class_type_id))];
  const { data: types } = await admin
    .from('class_types')
    .select('id, name, colour, duration_minutes, capacity, instructor_id')
    .in('id', needTypeIds)
    .eq('is_active', true);

  const typeMap = new Map(
    (types ?? []).map(
      (t: {
        id: string;
        name: string;
        colour: string;
        duration_minutes: number;
        capacity: number;
      }) => [t.id, t],
    ),
  );

  const calendarIdByClassTypeId = new Map<string, string | null>();
  await Promise.all(
    needTypeIds.map(async (tid) => {
      const ct = types?.find((t: { id: string }) => t.id === tid) as
        | { instructor_id?: string | null }
        | undefined;
      const cal = await resolveInstructorCalendarIdForClass(
        admin,
        venueId,
        ct?.instructor_id ?? null,
      );
      calendarIdByClassTypeId.set(tid, cal);
    }),
  );

  for (const raw of ciRows ?? []) {
    const row = raw as {
      id: string;
      instance_date: string;
      start_time: string;
      class_type_id: string;
      capacity_override?: number | null;
    };
    if (bookedClassIds.has(row.id)) continue;
    const ct = typeMap.get(row.class_type_id);
    if (!ct) continue;
    const calId = calendarIdByClassTypeId.get(row.class_type_id) ?? null;
    if (calId && !columnIds.has(calId)) continue;

    const start = hhmm(row.start_time);
    const end = minutesToTime(timeToMinutes(start) + ct.duration_minutes);
    const cap =
      row.capacity_override != null && row.capacity_override > 0
        ? row.capacity_override
        : ct.capacity;

    blocks.push({
      id: `ci-${row.id}`,
      kind: 'class_session',
      date: row.instance_date,
      start_time: start,
      end_time: end,
      title: ct.name,
      subtitle: null,
      accent_colour: ct.colour ?? '#22C55E',
      class_instance_id: row.id,
      class_capacity: cap,
      class_booked_spots: 0,
      calendar_id: calId,
    });
  }

  blocks.sort((a, b) => a.date.localeCompare(b.date) || a.start_time.localeCompare(b.start_time));
  return blocks;
}

/** Resolve calendar column ids for CDE booking rows (events, classes). */
export async function loadLinkedCdeColumnMaps(
  admin: SupabaseClient,
  venueId: string,
  rawBookings: Array<Record<string, unknown>>,
): Promise<{
  eventCalendarByEventId: Map<string, string | null>;
  classCalendarByInstanceId: Map<string, string | null>;
}> {
  const eventIds = [
    ...new Set(
      rawBookings
        .map((b) => b.experience_event_id as string | null)
        .filter((x): x is string => Boolean(x)),
    ),
  ];
  const classInstIds = [
    ...new Set(
      rawBookings
        .map((b) => b.class_instance_id as string | null)
        .filter((x): x is string => Boolean(x)),
    ),
  ];

  const eventCalendarByEventId = new Map<string, string | null>();
  if (eventIds.length > 0) {
    const { data: expEvents } = await admin
      .from('experience_events')
      .select('id, calendar_id')
      .in('id', eventIds);
    for (const e of expEvents ?? []) {
      eventCalendarByEventId.set(
        (e as { id: string }).id,
        ((e as { calendar_id?: string | null }).calendar_id ?? null) as string | null,
      );
    }
  }

  const classCalendarByInstanceId = new Map<string, string | null>();
  if (classInstIds.length > 0) {
    const { data: classInstRows } = await admin
      .from('class_instances')
      .select('id, class_type_id, class_types(instructor_id)')
      .in('id', classInstIds);

    const typeInstructor = new Map<string, string | null>();
    for (const row of classInstRows ?? []) {
      const r = row as {
        id: string;
        class_type_id: string;
        class_types?: { instructor_id?: string | null } | { instructor_id?: string | null }[] | null;
      };
      const ctRaw = r.class_types;
      const ct = Array.isArray(ctRaw) ? ctRaw[0] : ctRaw;
      typeInstructor.set(r.class_type_id, ct?.instructor_id ?? null);
    }

    const typeIds = [...new Set([...typeInstructor.keys()])];
    const calendarByTypeId = new Map<string, string | null>();
    await Promise.all(
      typeIds.map(async (tid) => {
        const cal = await resolveInstructorCalendarIdForClass(
          admin,
          venueId,
          typeInstructor.get(tid) ?? null,
        );
        calendarByTypeId.set(tid, cal);
      }),
    );

    for (const row of classInstRows ?? []) {
      const r = row as { id: string; class_type_id: string };
      classCalendarByInstanceId.set(r.id, calendarByTypeId.get(r.class_type_id) ?? null);
    }
  }

  return { eventCalendarByEventId, classCalendarByInstanceId };
}
