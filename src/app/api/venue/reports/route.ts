import type { SupabaseClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getVenueStaff, requireAdmin } from '@/lib/venue-auth';
import type { BookingModel } from '@/types/booking-models';
import { BOOKING_MODEL_ORDER } from '@/lib/booking/enabled-models';
import { inferBookingRowModel, bookingModelShortLabel } from '@/lib/booking/infer-booking-row-model';
import { isUnifiedSchedulingVenue } from '@/lib/booking/unified-scheduling';

export interface ReportByBookingModelRow {
  booking_model: BookingModel;
  label: string;
  booking_count: number;
  covers: number;
  cancelled_count: number;
  completed_count: number;
  checked_in_count: number;
  deposit_pence_collected: number;
}

type BookingBreakdownInput = {
  party_size: number | null;
  status: string | null;
  deposit_amount_pence: number | null;
  deposit_status: string | null;
  experience_event_id: string | null;
  class_instance_id: string | null;
  resource_id: string | null;
  event_session_id: string | null;
  calendar_id: string | null;
  service_item_id: string | null;
  practitioner_id: string | null;
  appointment_service_id: string | null;
  checked_in_at: string | null;
};

function buildBookingModelBreakdown(rows: BookingBreakdownInput[]): ReportByBookingModelRow[] {
  const acc = new Map<
    BookingModel,
    {
      booking_count: number;
      covers: number;
      cancelled_count: number;
      completed_count: number;
      checked_in_count: number;
      deposit_pence_collected: number;
    }
  >();

  for (const r of rows) {
    const m = inferBookingRowModel(r);
    const cur =
      acc.get(m) ?? {
        booking_count: 0,
        covers: 0,
        cancelled_count: 0,
        completed_count: 0,
        checked_in_count: 0,
        deposit_pence_collected: 0,
      };
    cur.booking_count += 1;
    cur.covers += typeof r.party_size === 'number' && r.party_size > 0 ? r.party_size : 0;
    if (r.status === 'Cancelled') cur.cancelled_count += 1;
    if (r.status === 'Completed') cur.completed_count += 1;
    if (r.checked_in_at) cur.checked_in_count += 1;
    if (r.deposit_status === 'Paid' && typeof r.deposit_amount_pence === 'number') {
      cur.deposit_pence_collected += r.deposit_amount_pence;
    }
    acc.set(m, cur);
  }

  return BOOKING_MODEL_ORDER.filter((bm) => acc.has(bm)).map((booking_model) => {
    const v = acc.get(booking_model)!;
    return {
      booking_model,
      label: bookingModelShortLabel(booking_model),
      booking_count: v.booking_count,
      covers: v.covers,
      cancelled_count: v.cancelled_count,
      completed_count: v.completed_count,
      checked_in_count: v.checked_in_count,
      deposit_pence_collected: v.deposit_pence_collected,
    };
  });
}

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
    if (!requireAdmin(staff)) {
      return NextResponse.json({ error: 'Forbidden: admin only' }, { status: 403 });
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
      { data: venueFlags },
      { data: clientSummaryRaw, error: eClient },
    ] = await Promise.all([
      supabase.rpc('report_booking_summary', { p_venue_id: staff.venue_id, p_start: pStart, p_end: pEnd }),
      supabase.rpc('report_no_show_series', { p_venue_id: staff.venue_id, p_start: pStart, p_end: pEnd, p_granularity: 'day' }),
      supabase.rpc('report_cancellation', { p_venue_id: staff.venue_id, p_start: pStart, p_end: pEnd }),
      supabase.rpc('report_deposit_summary', { p_venue_id: staff.venue_id, p_start: pStart, p_end: pEnd }),
      staff.db
        .from('venues')
        .select('table_management_enabled, booking_model')
        .eq('id', staff.venue_id)
        .single(),
      staff.db.rpc('report_client_summary', {
        p_venue_id: staff.venue_id,
        p_from: from,
        p_to: to,
      }),
    ]);

    if (e1 || e2 || e3 || e4) {
      console.error('reports rpc errors:', e1, e2, e3, e4);
      return NextResponse.json({ error: 'Failed to load reports' }, { status: 500 });
    }

    if (eClient) {
      console.error('report_client_summary failed:', eClient);
    }

    const { data: bookingRowsForModel, error: eBm } = await staff.db
      .from('bookings')
      .select(
        `party_size, status, deposit_amount_pence, deposit_status, experience_event_id, class_instance_id, resource_id, event_session_id, calendar_id, service_item_id, practitioner_id, appointment_service_id, checked_in_at`,
      )
      .eq('venue_id', staff.venue_id)
      .gte('booking_date', from)
      .lte('booking_date', to);

    if (eBm) {
      console.error('[reports] booking model breakdown query failed:', eBm);
    }
    const report_by_booking_model = buildBookingModelBreakdown((bookingRowsForModel ?? []) as BookingBreakdownInput[]);

    const clientSummaryParsed = clientSummaryRaw as Record<string, unknown> | null;
    const client_summary = {
      identified_clients_total: Number(clientSummaryParsed?.identified_clients_total ?? 0),
      new_clients_in_period: Number(clientSummaryParsed?.new_clients_in_period ?? 0),
      returning_clients_in_period: Number(clientSummaryParsed?.returning_clients_in_period ?? 0),
      anonymous_visits_in_period: Number(clientSummaryParsed?.anonymous_visits_in_period ?? 0),
    };

    const bookingModel = (venueFlags?.booking_model as BookingModel | undefined) ?? 'table_reservation';

    const summaryObj = Array.isArray(summary) ? summary[0] : summary;
    const cancellationObj = Array.isArray(cancellation) ? cancellation[0] : cancellation;
    const depositObj = Array.isArray(deposit) ? deposit[0] : deposit;
    let tableUtilisation: Array<{ table_id: string; table_name: string; utilisation_pct: number; occupied_hours: number; available_hours: number }> = [];

    if (venueFlags?.table_management_enabled && !isUnifiedSchedulingVenue(bookingModel)) {
      const [{ data: tables }, { data: assignments }] = await Promise.all([
        staff.db.from('venue_tables').select('id, name').eq('venue_id', staff.venue_id).eq('is_active', true),
        staff.db
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
    if (isUnifiedSchedulingVenue(bookingModel)) {
      report7_appointment_insights = await buildAppointmentInsights(staff.db, staff.venue_id, from, to);
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
      report7_appointment_insights: report7_appointment_insights,
      report_by_booking_model,
      client_summary,
    });
  } catch (err) {
    console.error('GET /api/venue/reports failed:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
