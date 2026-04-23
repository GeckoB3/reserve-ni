import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getVenueStaff } from '@/lib/venue-auth';
import { inferBookingRowModel } from '@/lib/booking/infer-booking-row-model';
import {
  detectAdjacentTables,
  findValidCombinations,
  getOccupiedTableIdsForWindow,
  getRequestWindowMinutes,
  type AutoCombinationOverrideInput,
  type CombinationBooking,
  type CombinationBlock,
  type CombinationTable,
  type ManualCombination,
} from '@/lib/table-management/combination-engine';

function parsePositiveInt(value: string | null, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.round(parsed);
}

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const staff = await getVenueStaff(supabase);
  if (!staff) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const date = searchParams.get('date');
  const time = searchParams.get('time');
  const partySize = parsePositiveInt(searchParams.get('party_size'), 0);
  const durationMinutes = parsePositiveInt(searchParams.get('duration_minutes'), 90);
  const excludeBookingId = searchParams.get('booking_id') ?? undefined;
  const areaIdParam = searchParams.get('area_id');
  const areaIdUuid =
    areaIdParam && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(areaIdParam)
      ? areaIdParam
      : undefined;

  if (!date || !time || partySize < 1) {
    return NextResponse.json({ error: 'date, time and party_size are required' }, { status: 400 });
  }

  if (areaIdUuid) {
    const { data: areaRow, error: areaErr } = await staff.db
      .from('areas')
      .select('id')
      .eq('id', areaIdUuid)
      .eq('venue_id', staff.venue_id)
      .maybeSingle();
    if (areaErr || !areaRow) {
      return NextResponse.json({ error: 'Invalid area_id' }, { status: 400 });
    }
  }

  const [venueRes, tablesRes, combosRes, bookingsRes, blocksRes, overridesRes] = await Promise.all([
    staff.db
      .from('venues')
      .select('combination_threshold')
      .eq('id', staff.venue_id)
      .single(),
    (() => {
      let q = staff.db
        .from('venue_tables')
        .select('id, name, max_covers, is_active, position_x, position_y, width, height, rotation')
        .eq('venue_id', staff.venue_id)
        .eq('is_active', true);
      if (areaIdUuid) q = q.eq('area_id', areaIdUuid);
      return q;
    })(),
    (() => {
      let q = staff.db
        .from('table_combinations')
        .select(
          'id, name, combined_min_covers, combined_max_covers, is_active, days_of_week, time_start, time_end, booking_type_filters, requires_manager_approval, internal_notes, members:table_combination_members(table_id)',
        )
        .eq('venue_id', staff.venue_id)
        .eq('is_active', true);
      if (areaIdUuid) q = q.eq('area_id', areaIdUuid);
      return q;
    })(),
    staff.db
      .from('bookings')
      .select('id, status, booking_time, estimated_end_time')
      .eq('venue_id', staff.venue_id)
      .eq('booking_date', date)
      .in('status', ['Pending', 'Booked', 'Confirmed', 'Seated']),
    staff.db
      .from('table_blocks')
      .select('table_id, start_at, end_at')
      .eq('venue_id', staff.venue_id)
      .lt('start_at', `${date}T23:59:59.999Z`)
      .gt('end_at', `${date}T00:00:00.000Z`),
    (() => {
      let q = staff.db.from('combination_auto_overrides').select('*').eq('venue_id', staff.venue_id);
      if (areaIdUuid) q = q.eq('area_id', areaIdUuid);
      return q;
    })(),
  ]);

  if (tablesRes.error || combosRes.error || bookingsRes.error || blocksRes.error) {
    console.error('Combination suggestion fetch failed:', {
      tables: tablesRes.error,
      combos: combosRes.error,
      bookings: bookingsRes.error,
      blocks: blocksRes.error,
    });
    return NextResponse.json({ error: 'Failed to generate suggestions' }, { status: 500 });
  }

  const bookingIds = (bookingsRes.data ?? []).map((booking) => booking.id);
  const bookingToTables = new Map<string, string[]>();

  if (bookingIds.length > 0) {
    const { data: assignments, error: assignmentsError } = await staff.db
      .from('booking_table_assignments')
      .select('booking_id, table_id')
      .in('booking_id', bookingIds);
    if (assignmentsError) {
      console.error('Combination suggestion failed to load assignments:', assignmentsError);
      return NextResponse.json({ error: 'Failed to generate suggestions' }, { status: 500 });
    }
    for (const assignment of assignments ?? []) {
      const existing = bookingToTables.get(assignment.booking_id) ?? [];
      existing.push(assignment.table_id);
      bookingToTables.set(assignment.booking_id, existing);
    }
  }

  const tables: CombinationTable[] = (tablesRes.data ?? []).map((table) => ({
    id: table.id,
    name: table.name,
    max_covers: table.max_covers,
    is_active: table.is_active,
    position_x: table.position_x,
    position_y: table.position_y,
    width: table.width,
    height: table.height,
    rotation: table.rotation,
  }));

  const bookings: CombinationBooking[] = (bookingsRes.data ?? []).map((booking) => ({
    id: booking.id,
    status: booking.status,
    booking_time: booking.booking_time,
    estimated_end_time: booking.estimated_end_time,
    table_ids: bookingToTables.get(booking.id) ?? [],
  }));

  const blocks: CombinationBlock[] = (blocksRes.data ?? []).map((block) => ({
    table_id: block.table_id,
    start_at: block.start_at,
    end_at: block.end_at,
  }));

  const manualCombinations: ManualCombination[] = (combosRes.data ?? []).map((combo: Record<string, unknown>) => ({
    id: combo.id as string,
    name: combo.name as string,
    combined_min_covers: combo.combined_min_covers as number,
    combined_max_covers: combo.combined_max_covers as number,
    is_active: combo.is_active as boolean,
    table_ids: ((combo.members ?? []) as { table_id: string }[]).map((m) => m.table_id),
    days_of_week: combo.days_of_week as number[] | undefined,
    time_start: (combo.time_start as string | null | undefined) ?? null,
    time_end: (combo.time_end as string | null | undefined) ?? null,
    booking_type_filters: (combo.booking_type_filters as string[] | null | undefined) ?? null,
    requires_manager_approval: (combo.requires_manager_approval as boolean | undefined) ?? false,
    internal_notes: (combo.internal_notes as string | null | undefined) ?? null,
  }));

  const autoOverrides = new Map<string, AutoCombinationOverrideInput>();
  if (!overridesRes.error && overridesRes.data) {
    for (const row of overridesRes.data as Record<string, unknown>[]) {
      autoOverrides.set(row.table_group_key as string, {
        id: row.id as string,
        table_group_key: row.table_group_key as string,
        disabled: row.disabled as boolean,
        locked: (row.locked as boolean) ?? false,
        display_name: (row.display_name as string | null) ?? null,
        combined_min_covers: (row.combined_min_covers as number | null) ?? null,
        combined_max_covers: (row.combined_max_covers as number | null) ?? null,
        days_of_week: (row.days_of_week as number[]) ?? [1, 2, 3, 4, 5, 6, 7],
        time_start: (row.time_start as string | null) ?? null,
        time_end: (row.time_end as string | null) ?? null,
        booking_type_filters: (row.booking_type_filters as string[] | null) ?? null,
        requires_manager_approval: (row.requires_manager_approval as boolean) ?? false,
        internal_notes: (row.internal_notes as string | null) ?? null,
      });
    }
  } else if (overridesRes.error) {
    console.error('suggest combination_auto_overrides:', overridesRes.error.message);
  }

  let bookingContext:
    | { bookingDate: string; bookingTime: string; bookingModel: ReturnType<typeof inferBookingRowModel> }
    | undefined;
  if (excludeBookingId) {
    const { data: bRow } = await staff.db
      .from('bookings')
      .select(
        'experience_event_id, class_instance_id, resource_id, event_session_id, calendar_id, service_item_id, practitioner_id, appointment_service_id',
      )
      .eq('id', excludeBookingId)
      .single();
    const timePart = time.length >= 5 ? time.slice(0, 5) : time;
    bookingContext = {
      bookingDate: date,
      bookingTime: timePart,
      bookingModel: inferBookingRowModel(bRow ?? {}),
    };
  }

  const threshold = venueRes.data?.combination_threshold ?? 80;
  const adjacency = detectAdjacentTables(tables, threshold);
  const datetime = `${date}T${time.length === 5 ? `${time}:00` : time}.000Z`;

  const suggestions = findValidCombinations({
    partySize,
    datetime,
    durationMinutes,
    tables,
    bookings,
    blocks,
    adjacencyMap: adjacency,
    manualCombinations,
    autoOverrides,
    bookingContext,
    excludeBookingId,
  });

  const { requestStartMin, requestEndMin } = getRequestWindowMinutes(datetime, durationMinutes);
  const occupied_table_ids = getOccupiedTableIdsForWindow(
    tables.map((t) => t.id),
    requestStartMin,
    requestEndMin,
    bookings,
    blocks,
    excludeBookingId,
  );

  return NextResponse.json({
    threshold,
    suggestions,
    best: suggestions[0] ?? null,
    occupied_table_ids,
  });
}
