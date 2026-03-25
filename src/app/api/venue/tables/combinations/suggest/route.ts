import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getVenueStaff } from '@/lib/venue-auth';
import {
  detectAdjacentTables,
  findValidCombinations,
  getOccupiedTableIdsForWindow,
  getRequestWindowMinutes,
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

  if (!date || !time || partySize < 1) {
    return NextResponse.json({ error: 'date, time and party_size are required' }, { status: 400 });
  }

  const [venueRes, tablesRes, combosRes, bookingsRes, blocksRes] = await Promise.all([
    staff.db
      .from('venues')
      .select('combination_threshold')
      .eq('id', staff.venue_id)
      .single(),
    staff.db
      .from('venue_tables')
      .select('id, name, max_covers, is_active, position_x, position_y, width, height, rotation')
      .eq('venue_id', staff.venue_id)
      .eq('is_active', true),
    staff.db
      .from('table_combinations')
      .select('id, name, combined_min_covers, combined_max_covers, is_active, members:table_combination_members(table_id)')
      .eq('venue_id', staff.venue_id)
      .eq('is_active', true),
    staff.db
      .from('bookings')
      .select('id, status, booking_time, estimated_end_time')
      .eq('venue_id', staff.venue_id)
      .eq('booking_date', date)
      .in('status', ['Pending', 'Confirmed', 'Seated']),
    staff.db
      .from('table_blocks')
      .select('table_id, start_at, end_at')
      .eq('venue_id', staff.venue_id)
      .lt('start_at', `${date}T23:59:59.999Z`)
      .gt('end_at', `${date}T00:00:00.000Z`),
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

  const manualCombinations: ManualCombination[] = (combosRes.data ?? []).map((combo) => ({
    id: combo.id,
    name: combo.name,
    combined_min_covers: combo.combined_min_covers,
    combined_max_covers: combo.combined_max_covers,
    is_active: combo.is_active,
    table_ids: (combo.members ?? []).map((member: { table_id: string }) => member.table_id),
  }));

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
