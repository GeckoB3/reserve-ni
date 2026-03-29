import type { SupabaseClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getVenueStaff } from '@/lib/venue-auth';
import type { BookingModel } from '@/types/booking-models';

export interface AppointmentInsightsRow {
  practitioner_id: string;
  practitioner_name: string;
  booking_count: number;
  completed_count: number;
}

export interface AppointmentServiceInsightsRow {
  service_id: string;
  service_name: string;
  booking_count: number;
}

async function buildAppointmentInsights(
  supabase: SupabaseClient,
  venueId: string,
  from: string,
  to: string,
): Promise<{
  by_practitioner: AppointmentInsightsRow[];
  by_service: AppointmentServiceInsightsRow[];
  by_booking_source: Record<string, number>;
}> {
  const empty = {
    by_practitioner: [] as AppointmentInsightsRow[],
    by_service: [] as AppointmentServiceInsightsRow[],
    by_booking_source: {} as Record<string, number>,
  };

  const { data: rows, error } = await supabase
    .from('bookings')
    .select('id, status, source, practitioner_id, appointment_service_id')
    .eq('venue_id', venueId)
    .gte('booking_date', from)
    .lte('booking_date', to)
    .neq('status', 'Cancelled');

  if (error) {
    console.error('[reports] appointment insights bookings query failed:', error);
    return empty;
  }

  if (!rows?.length) return empty;

  const pracIds = [...new Set(rows.map((r) => r.practitioner_id).filter(Boolean))] as string[];
  const svcIds = [...new Set(rows.map((r) => r.appointment_service_id).filter(Boolean))] as string[];

  const [pracRes, svcRes] = await Promise.all([
    pracIds.length
      ? supabase.from('practitioners').select('id, name').in('id', pracIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[], error: null }),
    svcIds.length
      ? supabase.from('appointment_services').select('id, name').in('id', svcIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[], error: null }),
  ]);

  if (pracRes.error) console.error('[reports] practitioners lookup:', pracRes.error);
  if (svcRes.error) console.error('[reports] services lookup:', svcRes.error);

  const pracName = new Map((pracRes.data ?? []).map((p) => [p.id, p.name]));
  const svcName = new Map((svcRes.data ?? []).map((s) => [s.id, s.name]));

  const byPrac = new Map<string, { name: string; booking_count: number; completed_count: number }>();
  const bySvc = new Map<string, { name: string; booking_count: number }>();
  const bySource = new Map<string, number>();

  const UNASSIGNED = '__unassigned__';
  const NO_SERVICE = '__no_service__';

  for (const r of rows) {
    const src = String(r.source ?? 'unknown');
    bySource.set(src, (bySource.get(src) ?? 0) + 1);

    const pid = r.practitioner_id;
    const pkey = pid ?? UNASSIGNED;
    const pname = pid ? (pracName.get(pid) ?? 'Unknown') : 'Unassigned';
    const pcur = byPrac.get(pkey) ?? { name: pname, booking_count: 0, completed_count: 0 };
    pcur.booking_count += 1;
    if (r.status === 'Seated' || r.status === 'Completed') pcur.completed_count += 1;
    byPrac.set(pkey, pcur);

    const sid = r.appointment_service_id;
    const skey = sid ?? NO_SERVICE;
    const sname = sid ? (svcName.get(sid) ?? 'Unknown') : 'No service linked';
    const scur = bySvc.get(skey) ?? { name: sname, booking_count: 0 };
    scur.booking_count += 1;
    bySvc.set(skey, scur);
  }

  return {
    by_practitioner: [...byPrac.entries()]
      .map(([practitioner_id, v]) => ({
        practitioner_id,
        practitioner_name: v.name,
        booking_count: v.booking_count,
        completed_count: v.completed_count,
      }))
      .sort((a, b) => b.booking_count - a.booking_count),
    by_service: [...bySvc.entries()]
      .map(([service_id, v]) => ({
        service_id,
        service_name: v.name,
        booking_count: v.booking_count,
      }))
      .sort((a, b) => b.booking_count - a.booking_count),
    by_booking_source: Object.fromEntries(
      [...bySource.entries()].sort((a, b) => b[1] - a[1]),
    ),
  };
}

/**
 * GET /api/venue/reports?from=YYYY-MM-DD&to=YYYY-MM-DD
 * Returns report payloads for the authenticated venue (events as source of truth where applicable).
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const staff = await getVenueStaff(supabase);
    if (!staff) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    }

    const fromParam = request.nextUrl.searchParams.get('from');
    const toParam = request.nextUrl.searchParams.get('to');
    const fromStr = fromParam && /^\d{4}-\d{2}-\d{2}$/.test(fromParam) ? fromParam : null;
    const toStr = toParam && /^\d{4}-\d{2}-\d{2}$/.test(toParam) ? toParam : null;

    const now = new Date();
    const defaultTo = new Date(now);
    const defaultFrom = new Date(now);
    defaultFrom.setDate(defaultFrom.getDate() - 7);
    const from = fromStr ?? defaultFrom.toISOString().slice(0, 10);
    const to = toStr ?? defaultTo.toISOString().slice(0, 10);
    const pStart = `${from}T00:00:00.000Z`;
    const pEnd = `${to}T23:59:59.999Z`;

    const [
      { data: summary, error: e1 },
      { data: noShowSeries, error: e2 },
      { data: cancellation, error: e3 },
      { data: deposit, error: e4 },
      { data: frequentVisitors, error: e5 },
      { data: venueFlags },
    ] = await Promise.all([
      supabase.rpc('report_booking_summary', { p_venue_id: staff.venue_id, p_start: pStart, p_end: pEnd }),
      supabase.rpc('report_no_show_series', { p_venue_id: staff.venue_id, p_start: pStart, p_end: pEnd, p_granularity: 'day' }),
      supabase.rpc('report_cancellation', { p_venue_id: staff.venue_id, p_start: pStart, p_end: pEnd }),
      supabase.rpc('report_deposit_summary', { p_venue_id: staff.venue_id, p_start: pStart, p_end: pEnd }),
      supabase.rpc('report_frequent_visitors', {
        p_venue_id: staff.venue_id,
        p_start: from,
        p_end: to,
        p_limit: 100,
      }),
      staff.db
        .from('venues')
        .select('table_management_enabled, booking_model')
        .eq('id', staff.venue_id)
        .single(),
    ]);

    if (e1 || e2 || e3 || e4 || e5) {
      console.error('reports rpc errors:', e1, e2, e3, e4, e5);
      return NextResponse.json({ error: 'Failed to load reports' }, { status: 500 });
    }

    const bookingModel = (venueFlags?.booking_model as BookingModel | undefined) ?? 'table_reservation';

    const summaryObj = Array.isArray(summary) ? summary[0] : summary;
    const cancellationObj = Array.isArray(cancellation) ? cancellation[0] : cancellation;
    const depositObj = Array.isArray(deposit) ? deposit[0] : deposit;
    let tableUtilisation: Array<{ table_id: string; table_name: string; utilisation_pct: number; occupied_hours: number; available_hours: number }> = [];

    if (venueFlags?.table_management_enabled && bookingModel !== 'practitioner_appointment') {
      const [{ data: tables }, { data: assignments }] = await Promise.all([
        supabase.from('venue_tables').select('id, name').eq('venue_id', staff.venue_id).eq('is_active', true),
        supabase
          .from('booking_table_assignments')
          .select('table_id, booking:bookings!inner(booking_date, booking_time, estimated_end_time, status, venue_id)')
          .eq('booking.venue_id', staff.venue_id)
          .gte('booking.booking_date', from)
          .lte('booking.booking_date', to)
          .in('booking.status', ['Confirmed', 'Seated', 'Completed']),
      ]);

      const days = Math.max(1, Math.ceil((new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / 86400000) + 1);
      const availableHours = days * 12;
      const occupiedByTable = new Map<string, number>();
      for (const assignment of assignments ?? []) {
        const bookingRaw = assignment.booking as
          | { booking_time?: string | null; estimated_end_time?: string | null }
          | Array<{ booking_time?: string | null; estimated_end_time?: string | null }>
          | null;
        const booking = Array.isArray(bookingRaw) ? bookingRaw[0] : bookingRaw;
        const startRaw = booking?.booking_time?.slice(0, 5) ?? '00:00';
        const start = Number(startRaw.slice(0, 2)) * 60 + Number(startRaw.slice(3, 5));
        const endRaw = booking?.estimated_end_time?.includes('T')
          ? (booking.estimated_end_time.split('T')[1] ?? '').slice(0, 5)
          : booking?.estimated_end_time?.slice(0, 5);
        const end = endRaw ? Number(endRaw.slice(0, 2)) * 60 + Number(endRaw.slice(3, 5)) : start + 90;
        const durationHours = Math.max(0.25, (end - start) / 60);
        occupiedByTable.set(assignment.table_id, (occupiedByTable.get(assignment.table_id) ?? 0) + durationHours);
      }

      tableUtilisation = (tables ?? []).map((table: { id: string; name: string }) => {
        const occupied = occupiedByTable.get(table.id) ?? 0;
        const utilisation = availableHours > 0 ? Math.min(100, Math.round((occupied / availableHours) * 100)) : 0;
        return {
          table_id: table.id,
          table_name: table.name,
          utilisation_pct: utilisation,
          occupied_hours: Number(occupied.toFixed(2)),
          available_hours: availableHours,
        };
      });
    }

    let report7_appointment_insights: Awaited<ReturnType<typeof buildAppointmentInsights>> | null = null;
    if (bookingModel === 'practitioner_appointment') {
      report7_appointment_insights = await buildAppointmentInsights(supabase, staff.venue_id, from, to);
    }

    return NextResponse.json({
      from,
      to,
      booking_model: bookingModel,
      table_management_enabled: venueFlags?.table_management_enabled ?? false,
      report1_booking_summary: summaryObj ?? null,
      report2_no_show_series: noShowSeries ?? [],
      report3_cancellation: cancellationObj ?? null,
      report4_deposit: depositObj ?? null,
      report5_table_utilisation: tableUtilisation,
      report6_frequent_visitors: frequentVisitors ?? [],
      report7_appointment_insights: report7_appointment_insights,
    });
  } catch (err) {
    console.error('GET /api/venue/reports failed:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
