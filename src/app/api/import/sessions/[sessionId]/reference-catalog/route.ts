import { NextResponse } from 'next/server';
import { requireImportAdmin } from '@/lib/import/auth';
import { resolveVenueMode } from '@/lib/venue-mode';

/** Lists selectable entities for Step 3b reference mapping. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const ctx = await requireImportAdmin();
  if ('response' in ctx) return ctx.response;
  const { staff } = ctx;
  await params;

  const mode = await resolveVenueMode(staff.db, staff.venue_id);
  const bm = mode.bookingModel;

  const venueId = staff.venue_id;

  if (bm === 'practitioner_appointment') {
    const [{ data: ppl }, { data: svcs }] = await Promise.all([
      staff.db.from('practitioners').select('id, name').eq('venue_id', venueId).eq('is_active', true).order('sort_order'),
      staff.db
        .from('appointment_services')
        .select('id, name')
        .eq('venue_id', venueId)
        .eq('is_active', true)
        .order('sort_order'),
    ]);
    return NextResponse.json({
      bookingModel: bm,
      serviceItems: [] as { id: string; name: string }[],
      calendars: [] as { id: string; name: string }[],
      practitioners: (ppl ?? []).map((p) => ({ id: (p as { id: string }).id, name: (p as { name: string }).name })),
      appointmentServices: (svcs ?? []).map((s) => ({
        id: (s as { id: string }).id,
        name: (s as { name: string }).name,
      })),
      eventSessions: [] as { id: string; name: string }[],
      classInstances: [] as { id: string; name: string }[],
      resourceCalendars: [] as { id: string; name: string }[],
    });
  }

  if (bm === 'unified_scheduling') {
    const [{ data: services }, { data: calendars }] = await Promise.all([
      staff.db.from('service_items').select('id, name').eq('venue_id', venueId).eq('is_active', true).order('sort_order'),
      staff.db
        .from('unified_calendars')
        .select('id, name')
        .eq('venue_id', venueId)
        .eq('is_active', true)
        .order('sort_order'),
    ]);
    return NextResponse.json({
      bookingModel: bm,
      serviceItems: (services ?? []).map((s) => ({
        id: (s as { id: string }).id,
        name: (s as { name: string }).name,
      })),
      calendars: (calendars ?? []).map((c) => ({
        id: (c as { id: string }).id,
        name: (c as { name: string }).name,
      })),
      practitioners: [] as { id: string; name: string }[],
      appointmentServices: [] as { id: string; name: string }[],
      eventSessions: [] as { id: string; name: string }[],
      classInstances: [] as { id: string; name: string }[],
      resourceCalendars: [] as { id: string; name: string }[],
    });
  }

  if (bm === 'event_ticket') {
    const { data: sessions } = await staff.db
      .from('event_sessions')
      .select('id, session_date, start_time')
      .eq('venue_id', venueId)
      .eq('is_cancelled', false)
      .order('session_date', { ascending: true })
      .order('start_time', { ascending: true })
      .limit(400);
    return NextResponse.json({
      bookingModel: bm,
      serviceItems: [] as { id: string; name: string }[],
      calendars: [] as { id: string; name: string }[],
      practitioners: [] as { id: string; name: string }[],
      appointmentServices: [] as { id: string; name: string }[],
      eventSessions: (sessions ?? []).map((es) => {
        const x = es as { id: string; session_date: string; start_time: string };
        return {
          id: x.id,
          name: `${x.session_date} ${String(x.start_time).slice(0, 5)}`,
        };
      }),
      classInstances: [] as { id: string; name: string }[],
      resourceCalendars: [] as { id: string; name: string }[],
    });
  }

  if (bm === 'class_session') {
    const { data: typeRows } = await staff.db.from('class_types').select('id').eq('venue_id', venueId);
    const typeIds = (typeRows ?? []).map((t) => (t as { id: string }).id);
    let inst: unknown[] | null = null;
    if (typeIds.length) {
      const res = await staff.db
        .from('class_instances')
        .select('id, instance_date, start_time, class_types(name)')
        .in('class_type_id', typeIds)
        .eq('is_cancelled', false)
        .order('instance_date', { ascending: true })
        .limit(400);
      inst = res.data ?? null;
    }
    return NextResponse.json({
      bookingModel: bm,
      serviceItems: [] as { id: string; name: string }[],
      calendars: [] as { id: string; name: string }[],
      practitioners: [] as { id: string; name: string }[],
      appointmentServices: [] as { id: string; name: string }[],
      eventSessions: [] as { id: string; name: string }[],
      classInstances: (inst ?? []).map((ci) => {
        const row = ci as {
          id: string;
          instance_date: string;
          start_time: string;
          class_types: { name?: string } | { name?: string }[] | null;
        };
        const tn = Array.isArray(row.class_types) ? row.class_types[0]?.name : row.class_types?.name;
        return {
          id: row.id,
          name: `${tn ?? 'Class'} · ${row.instance_date} ${String(row.start_time).slice(0, 5)}`,
        };
      }),
      resourceCalendars: [] as { id: string; name: string }[],
    });
  }

  if (bm === 'resource_booking') {
    const { data: resCals } = await staff.db
      .from('unified_calendars')
      .select('id, name')
      .eq('venue_id', venueId)
      .eq('is_active', true)
      .eq('calendar_type', 'resource')
      .order('sort_order');
    return NextResponse.json({
      bookingModel: bm,
      serviceItems: [] as { id: string; name: string }[],
      calendars: [] as { id: string; name: string }[],
      practitioners: [] as { id: string; name: string }[],
      appointmentServices: [] as { id: string; name: string }[],
      eventSessions: [] as { id: string; name: string }[],
      classInstances: [] as { id: string; name: string }[],
      resourceCalendars: (resCals ?? []).map((c) => ({
        id: (c as { id: string }).id,
        name: (c as { name: string }).name,
      })),
    });
  }

  return NextResponse.json({
    bookingModel: bm,
    serviceItems: [] as { id: string; name: string }[],
    calendars: [] as { id: string; name: string }[],
    practitioners: [] as { id: string; name: string }[],
    appointmentServices: [] as { id: string; name: string }[],
    eventSessions: [] as { id: string; name: string }[],
    classInstances: [] as { id: string; name: string }[],
    resourceCalendars: [] as { id: string; name: string }[],
  });
}
