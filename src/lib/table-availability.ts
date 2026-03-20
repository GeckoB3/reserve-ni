/**
 * Table availability engine — optional layer on top of covers-based system.
 *
 * When table_management_enabled, BOTH covers AND table availability must pass.
 * This module provides two core functions:
 *   1. getAvailableTablesForBooking — find best table(s) for a booking
 *   2. getTableAvailabilityGrid — full grid data for timeline view
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { VenueTable, TableAvailabilityCandidate, TableGridData, TableGridCell } from '@/types/table-management';
import { timeToMinutes, minutesToTime } from '@/lib/availability';
import { BOOKING_ACTIVE_STATUSES } from '@/lib/table-management/constants';
import {
  detectAdjacentTables,
  findValidCombinations,
  type CombinationBooking,
  type CombinationBlock,
  type CombinationTable,
  type ManualCombination,
} from '@/lib/table-management/combination-engine';

interface BookingWithTime {
  id: string;
  booking_time: string;
  estimated_end_time: string | null;
  party_size: number;
  status: string;
  deposit_status?: string | null;
  guest_name: string;
  dietary_notes: string | null;
  occasion: string | null;
  table_ids: string[];
}

interface TableBlock {
  id: string;
  table_id: string;
  start_at: string;
  end_at: string;
  reason: string | null;
}

function getBookingTimeRange(b: BookingWithTime, defaultDuration = 90): { startMin: number; endMin: number } {
  const startMin = timeToMinutes(b.booking_time);
  let endMin: number;
  if (b.estimated_end_time) {
    const timePart = b.estimated_end_time.split('T')[1];
    endMin = timePart ? timeToMinutes(timePart) : startMin + defaultDuration;
  } else {
    endMin = startMin + defaultDuration;
  }
  return { startMin, endMin };
}

function doIntervalsOverlap(s1: number, e1: number, s2: number, e2: number): boolean {
  return s1 < e2 && s2 < e1;
}

/**
 * Find the best available table(s) for a booking.
 * Returns sorted candidates: single tables first (smallest adequate), then combinations.
 */
export async function getAvailableTablesForBooking(
  supabase: SupabaseClient,
  venueId: string,
  date: string,
  startTime: string,
  durationMinutes: number,
  bufferMinutes: number,
  partySize: number,
): Promise<TableAvailabilityCandidate[]> {
  const [venueRes, tablesRes, blocksRes] = await Promise.all([
    supabase
      .from('venues')
      .select('combination_threshold')
      .eq('id', venueId)
      .single(),
    supabase
      .from('venue_tables')
      .select('*')
      .eq('venue_id', venueId)
      .eq('is_active', true)
      .order('sort_order'),
    supabase
      .from('table_blocks')
      .select('id, table_id, start_at, end_at, reason')
      .eq('venue_id', venueId)
      .lt('start_at', `${date}T23:59:59.999Z`)
      .gt('end_at', `${date}T00:00:00.000Z`),
  ]);
  const tables = tablesRes.data;
  const blocks = (blocksRes.data ?? []) as TableBlock[];

  if (!tables?.length) return [];

  const { data: assignments } = await supabase
    .from('booking_table_assignments')
    .select('table_id, booking:bookings!inner(id, booking_date, booking_time, estimated_end_time, party_size, status)')
    .eq('booking.booking_date', date)
    .in('booking.status', [...BOOKING_ACTIVE_STATUSES]);

  const bookingsById = new Map<string, CombinationBooking>();
  if (assignments) {
    for (const a of assignments) {
      const b = a.booking as unknown as {
        id: string;
        booking_time: string;
        estimated_end_time: string | null;
        status: string;
      };
      if (!BOOKING_ACTIVE_STATUSES.includes(b.status as (typeof BOOKING_ACTIVE_STATUSES)[number])) continue;

      const existingBooking = bookingsById.get(b.id) ?? {
        id: b.id,
        status: b.status,
        booking_time: b.booking_time,
        estimated_end_time: b.estimated_end_time,
        table_ids: [],
      };
      if (!existingBooking.table_ids.includes(a.table_id)) {
        existingBooking.table_ids.push(a.table_id);
      }
      bookingsById.set(b.id, existingBooking);
    }
  }

  const requestStart = timeToMinutes(startTime);
  const requestEnd = requestStart + durationMinutes + bufferMinutes;

  const blockRangesByTable = new Map<string, Array<{ startMin: number; endMin: number }>>();
  for (const block of blocks) {
    const range = {
      startMin: timeToMinutes((block.start_at.split('T')[1] ?? '00:00:00').slice(0, 5)),
      endMin: timeToMinutes((block.end_at.split('T')[1] ?? '00:00:00').slice(0, 5)),
    };
    const existing = blockRangesByTable.get(block.table_id) ?? [];
    existing.push(range);
    blockRangesByTable.set(block.table_id, existing);
  }

  const { data: combinations } = await supabase
    .from('table_combinations')
    .select('*, members:table_combination_members(id, table_id)')
    .eq('venue_id', venueId)
    .eq('is_active', true);

  const algorithmTables: CombinationTable[] = (tables as VenueTable[]).map((table) => ({
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

  const algorithmBlocks: CombinationBlock[] = blocks.map((block) => ({
    table_id: block.table_id,
    start_at: block.start_at,
    end_at: block.end_at,
  }));

  const manualCombinations: ManualCombination[] = (combinations ?? []).map((combo) => ({
    id: combo.id,
    name: combo.name,
    combined_min_covers: combo.combined_min_covers,
    combined_max_covers: combo.combined_max_covers,
    is_active: combo.is_active,
    table_ids: (combo.members ?? []).map((member: { table_id: string }) => member.table_id),
  }));

  const threshold = venueRes.data?.combination_threshold ?? 80;
  const suggestions = findValidCombinations({
    partySize,
    datetime: `${date}T${startTime}:00.000Z`,
    durationMinutes: durationMinutes + bufferMinutes,
    tables: algorithmTables,
    bookings: Array.from(bookingsById.values()),
    blocks: algorithmBlocks,
    adjacencyMap: detectAdjacentTables(algorithmTables, threshold),
    manualCombinations,
  });

  const tableMap = new Map((tables as VenueTable[]).map((table) => [table.id, table]));
  const manualByKey = new Map(
    manualCombinations.map((combo) => [[...combo.table_ids].sort().join('|'), combo] as const)
  );

  return suggestions.map((suggestion) => {
    const comboKey = [...suggestion.table_ids].sort().join('|');
    const manual = manualByKey.get(comboKey);
    if (suggestion.source === 'single') {
      const table = tableMap.get(suggestion.table_ids[0]!);
      return {
        type: 'single',
        source: 'single',
        table_ids: suggestion.table_ids,
        table_names: suggestion.table_names,
        min_covers: table?.min_covers ?? 1,
        max_covers: suggestion.combined_capacity,
        spare_covers: suggestion.spare_covers,
        score: suggestion.score,
      } satisfies TableAvailabilityCandidate;
    }

    return {
      type: 'combination',
      source: suggestion.source,
      table_ids: suggestion.table_ids,
      table_names: suggestion.table_names,
      min_covers: manual?.combined_min_covers ?? 1,
      max_covers: manual?.combined_max_covers ?? suggestion.combined_capacity,
      combination_id: manual?.id,
      combination_name: manual?.name,
      spare_covers: suggestion.spare_covers,
      score: suggestion.score,
    } satisfies TableAvailabilityCandidate;
  });
}

/**
 * Get full grid data for the timeline grid view.
 * Returns all tables, occupied cells, and unassigned bookings.
 */
export async function getTableAvailabilityGrid(
  supabase: SupabaseClient,
  venueId: string,
  date: string,
  serviceStartTime?: string,
  serviceEndTime?: string,
  slotInterval = 15,
): Promise<TableGridData> {
  const [tablesRes, bookingsRes, blocksRes] = await Promise.all([
    supabase
      .from('venue_tables')
      .select('*')
      .eq('venue_id', venueId)
      .eq('is_active', true)
      .order('sort_order'),
    supabase
      .from('bookings')
      .select('id, booking_time, estimated_end_time, party_size, status, deposit_status, dietary_notes, occasion, guest:guests!inner(name)')
      .eq('venue_id', venueId)
      .eq('booking_date', date)
      .in('status', [...BOOKING_ACTIVE_STATUSES]),
    supabase
      .from('table_blocks')
      .select('id, table_id, start_at, end_at, reason')
      .eq('venue_id', venueId)
      .lt('start_at', `${date}T23:59:59.999Z`)
      .gt('end_at', `${date}T00:00:00.000Z`),
  ]);

  const tables = (tablesRes.data ?? []) as VenueTable[];
  const activeTableIds = new Set(tables.map((table) => table.id));
  const rawBookings = (bookingsRes.data ?? []) as Array<{
    id: string;
    booking_time: string;
    estimated_end_time: string | null;
    party_size: number;
    status: string;
    deposit_status?: string | null;
    dietary_notes: string | null;
    occasion: string | null;
    guest: { name: string } | { name: string }[];
  }>;
  const blocks = (blocksRes.data ?? []) as TableBlock[];

  const bookingIds = rawBookings.map((b) => b.id);

  const assignmentMap = new Map<string, string[]>();
  const bookingToTables = new Map<string, string[]>();

  if (bookingIds.length > 0) {
    const { data: allAssignments } = await supabase
      .from('booking_table_assignments')
      .select('booking_id, table_id')
      .in('booking_id', bookingIds);

    if (allAssignments) {
      for (const a of allAssignments) {
        if (!activeTableIds.has(a.table_id)) {
          continue;
        }
        const existing = assignmentMap.get(a.table_id) ?? [];
        existing.push(a.booking_id);
        assignmentMap.set(a.table_id, existing);

        const bTables = bookingToTables.get(a.booking_id) ?? [];
        bTables.push(a.table_id);
        bookingToTables.set(a.booking_id, bTables);
      }
    }
  }

  const bookings: BookingWithTime[] = rawBookings.map((b) => {
    const guestName = Array.isArray(b.guest) ? b.guest[0]?.name ?? '' : b.guest?.name ?? '';
    return {
      id: b.id,
      booking_time: b.booking_time,
      estimated_end_time: b.estimated_end_time,
      party_size: b.party_size,
      status: b.status,
      deposit_status: b.deposit_status ?? null,
      guest_name: guestName,
      dietary_notes: b.dietary_notes,
      occasion: b.occasion,
      table_ids: bookingToTables.get(b.id) ?? [],
    };
  });

  const startMin = serviceStartTime ? timeToMinutes(serviceStartTime) : 9 * 60;
  const endMin = serviceEndTime ? timeToMinutes(serviceEndTime) : 23 * 60;

  const cells: TableGridCell[] = [];
  const tablesInUse = new Set<string>();
  let totalCoversBooked = 0;

  for (const table of tables) {
    const tableBookingIds = assignmentMap.get(table.id) ?? [];
    const tableBookings = bookings.filter((b) => tableBookingIds.includes(b.id));

    const tableBlocks = blocks.filter((block) => block.table_id === table.id);
    for (let m = startMin; m < endMin; m += slotInterval) {
      const timeStr = minutesToTime(m);
      let matchedBooking: BookingWithTime | null = null;

      for (const b of tableBookings) {
        const range = getBookingTimeRange(b);
        if (doIntervalsOverlap(m, m + slotInterval, range.startMin, range.endMin)) {
          matchedBooking = b;
          break;
        }
      }

      let matchedBlock: TableBlock | null = null;
      for (const block of tableBlocks) {
        const blockStart = timeToMinutes((block.start_at.split('T')[1] ?? '00:00:00').slice(0, 5));
        const blockEnd = timeToMinutes((block.end_at.split('T')[1] ?? '00:00:00').slice(0, 5));
        if (doIntervalsOverlap(m, m + slotInterval, blockStart, blockEnd)) {
          matchedBlock = block;
          break;
        }
      }

      cells.push({
        table_id: table.id,
        time: timeStr,
        is_available: !matchedBooking && !matchedBlock,
        is_blocked: Boolean(matchedBlock),
        booking_id: matchedBooking?.id ?? null,
        block_id: matchedBlock?.id ?? null,
        block_details: matchedBlock
          ? {
              id: matchedBlock.id,
              reason: matchedBlock.reason,
              start_time: (matchedBlock.start_at.split('T')[1] ?? '00:00:00').slice(0, 5),
              end_time: (matchedBlock.end_at.split('T')[1] ?? '00:00:00').slice(0, 5),
            }
          : null,
        booking_details: matchedBooking
          ? {
              guest_name: matchedBooking.guest_name,
              party_size: matchedBooking.party_size,
              status: matchedBooking.status,
              deposit_status: (matchedBooking as BookingWithTime & { deposit_status?: string | null }).deposit_status ?? null,
              start_time: matchedBooking.booking_time,
              end_time: minutesToTime(getBookingTimeRange(matchedBooking).endMin),
              dietary_notes: matchedBooking.dietary_notes,
              occasion: matchedBooking.occasion,
            }
          : null,
      });

      if (matchedBooking) tablesInUse.add(table.id);
    }
  }

  const assignedBookingIds = new Set(
    Array.from(bookingToTables.keys()),
  );
  const comboBookingsInUse = Array.from(bookingToTables.values()).filter((tableIds) => tableIds.length > 1).length;
  const unassigned = bookings
    .filter((b) => !assignedBookingIds.has(b.id))
    .map((b) => {
      const range = getBookingTimeRange(b);
      return {
        id: b.id,
        guest_name: b.guest_name,
        party_size: b.party_size,
        start_time: b.booking_time,
        end_time: minutesToTime(range.endMin),
        status: b.status,
        dietary_notes: b.dietary_notes,
        occasion: b.occasion,
      };
    });

  for (const b of bookings) {
    totalCoversBooked += b.party_size;
  }

  const totalCapacity = tables.reduce((sum, t) => sum + t.max_covers, 0);


  return {
    tables,
    cells,
    slot_interval_minutes: slotInterval,
    unassigned_bookings: unassigned,
    summary: {
      total_covers_booked: totalCoversBooked,
      total_covers_capacity: totalCapacity,
      tables_in_use: tablesInUse.size,
      tables_total: tables.length,
      unassigned_count: unassigned.length,
      combos_in_use: comboBookingsInUse,
    },
  };
}

/**
 * Auto-assign a table to a booking. Returns the assigned table(s) or null.
 */
export async function autoAssignTable(
  supabase: SupabaseClient,
  venueId: string,
  bookingId: string,
  date: string,
  startTime: string,
  durationMinutes: number,
  bufferMinutes: number,
  partySize: number,
): Promise<TableAvailabilityCandidate | null> {
  const candidates = await getAvailableTablesForBooking(
    supabase,
    venueId,
    date,
    startTime,
    durationMinutes,
    bufferMinutes,
    partySize,
  );

  if (candidates.length === 0) return null;

  const best = candidates[0]!;

  const inserts = best.table_ids.map((tableId) => ({
    booking_id: bookingId,
    table_id: tableId,
  }));

  const { error } = await supabase
    .from('booking_table_assignments')
    .insert(inserts);

  if (error) {
    console.error('Auto-assign table failed:', error);
    return null;
  }

  return best;
}
