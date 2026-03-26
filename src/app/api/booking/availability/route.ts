import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase';
import { computeAvailability, fetchEngineInput } from '@/lib/availability';
import { AVAILABILITY_SETUP_REQUIRED_MESSAGE } from '@/lib/availability/availability-errors';
import { resolveVenueMode } from '@/lib/venue-mode';
import type { VenueTable } from '@/types/table-management';
import { BOOKING_ACTIVE_STATUSES } from '@/lib/table-management/constants';
import {
  detectAdjacentTables,
  findValidCombinations,
  type CombinationBooking,
  type CombinationBlock,
  type CombinationTable,
  type ManualCombination,
} from '@/lib/table-management/combination-engine';
import { computeAppointmentAvailability, fetchAppointmentInput } from '@/lib/availability/appointment-engine';
import { computeEventAvailability, fetchEventInput } from '@/lib/availability/event-ticket-engine';
import { computeClassAvailability, fetchClassInput } from '@/lib/availability/class-session-engine';
import { computeResourceAvailability, fetchResourceInput } from '@/lib/availability/resource-booking-engine';

function toMinutes(value: string): number {
  const [h, m] = value.slice(0, 5).split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

function durationFromSlot(start: string, end?: string | null): number {
  if (!end) return 90;
  const startMin = toMinutes(start);
  let endMin = toMinutes(end);
  if (endMin <= startMin) endMin += 24 * 60;
  return Math.max(15, endMin - startMin);
}

/**
 * Batch-check which time slots have at least one table/combination available.
 * Fetches all shared data once, then runs the in-memory combination algorithm
 * per slot. This replaces the old sequential-per-slot approach that made N
 * separate DB round-trips.
 */
async function buildTableFilterByTime(
  supabase: ReturnType<typeof getSupabaseAdminClient>,
  venueId: string,
  date: string,
  slots: Array<{ start_time?: string; key?: string; end_time?: string }>,
  partySize: number,
): Promise<Set<string>> {
  const uniqueTimes = new Map<string, number>();
  for (const slot of slots) {
    const time = slot.start_time ?? slot.key;
    if (!time) continue;
    const duration = durationFromSlot(time, slot.end_time ?? null);
    if (!uniqueTimes.has(time)) uniqueTimes.set(time, duration);
  }
  if (uniqueTimes.size === 0) return new Set();

  const [venueRes, tablesRes, blocksRes, assignmentsRes, combinationsRes] = await Promise.all([
    supabase.from('venues').select('combination_threshold').eq('id', venueId).single(),
    supabase.from('venue_tables').select('*').eq('venue_id', venueId).eq('is_active', true).order('sort_order'),
    supabase.from('table_blocks').select('id, table_id, start_at, end_at, reason')
      .eq('venue_id', venueId)
      .lt('start_at', `${date}T23:59:59.999Z`)
      .gt('end_at', `${date}T00:00:00.000Z`),
    supabase.from('booking_table_assignments')
      .select('table_id, booking:bookings!inner(id, booking_date, booking_time, estimated_end_time, party_size, status)')
      .eq('booking.booking_date', date)
      .in('booking.status', [...BOOKING_ACTIVE_STATUSES]),
    supabase.from('table_combinations')
      .select('*, members:table_combination_members(id, table_id)')
      .eq('venue_id', venueId)
      .eq('is_active', true),
  ]);

  const tables = (tablesRes.data ?? []) as VenueTable[];
  if (tables.length === 0) return new Set();

  const bookingsById = new Map<string, CombinationBooking>();
  if (assignmentsRes.data) {
    for (const a of assignmentsRes.data) {
      const b = a.booking as unknown as {
        id: string; booking_time: string; estimated_end_time: string | null; status: string;
      };
      if (!BOOKING_ACTIVE_STATUSES.includes(b.status as (typeof BOOKING_ACTIVE_STATUSES)[number])) continue;
      const existing = bookingsById.get(b.id) ?? {
        id: b.id, status: b.status, booking_time: b.booking_time,
        estimated_end_time: b.estimated_end_time, table_ids: [],
      };
      if (!existing.table_ids.includes(a.table_id)) existing.table_ids.push(a.table_id);
      bookingsById.set(b.id, existing);
    }
  }

  const algorithmTables: CombinationTable[] = tables.map((t) => ({
    id: t.id, name: t.name, max_covers: t.max_covers, is_active: t.is_active,
    position_x: t.position_x, position_y: t.position_y,
    width: t.width, height: t.height, rotation: t.rotation,
  }));
  const algorithmBlocks: CombinationBlock[] = (blocksRes.data ?? []).map((b: { table_id: string; start_at: string; end_at: string }) => ({
    table_id: b.table_id, start_at: b.start_at, end_at: b.end_at,
  }));
  const manualCombinations: ManualCombination[] = (combinationsRes.data ?? []).map((c: Record<string, unknown>) => ({
    id: c.id as string, name: c.name as string,
    combined_min_covers: c.combined_min_covers as number,
    combined_max_covers: c.combined_max_covers as number,
    is_active: c.is_active as boolean,
    table_ids: ((c.members ?? []) as Array<{ table_id: string }>).map((m) => m.table_id),
  }));

  const threshold = venueRes.data?.combination_threshold ?? 80;
  const adjacencyMap = detectAdjacentTables(algorithmTables, threshold);
  const allBookings = Array.from(bookingsById.values());
  const bufferMinutes = 15;

  const timesWithTable = new Set<string>();
  for (const [time, duration] of uniqueTimes.entries()) {
    const results = findValidCombinations({
      partySize,
      datetime: `${date}T${time}:00.000Z`,
      durationMinutes: duration + bufferMinutes,
      tables: algorithmTables,
      bookings: allBookings,
      blocks: algorithmBlocks,
      adjacencyMap,
      manualCombinations,
    });
    if (results.length > 0) {
      timesWithTable.add(time);
    }
  }

  return timesWithTable;
}

/** GET /api/booking/availability?venue_id=uuid&date=YYYY-MM-DD&party_size=N */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const venueId = searchParams.get('venue_id');
    const dateStr = searchParams.get('date');
    const partySizeParam = searchParams.get('party_size');

    if (!venueId || !dateStr) {
      return NextResponse.json(
        { error: 'Missing required query params: venue_id, date' },
        { status: 400 }
      );
    }

    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(dateStr)) {
      return NextResponse.json(
        { error: 'Invalid date format; use YYYY-MM-DD' },
        { status: 400 }
      );
    }

    const partySize = partySizeParam ? parseInt(partySizeParam, 10) : null;
    if (partySize != null && (Number.isNaN(partySize) || partySize < 1)) {
      return NextResponse.json(
        { error: 'party_size must be a positive integer' },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdminClient();
    const venueMode = await resolveVenueMode(supabase, venueId);

    // Dispatch to model-specific availability engines
    if (venueMode.bookingModel === 'practitioner_appointment') {
      return handleAppointmentAvailability(supabase, venueId, dateStr, searchParams);
    }
    if (venueMode.bookingModel === 'event_ticket') {
      return handleEventAvailability(supabase, venueId, dateStr);
    }
    if (venueMode.bookingModel === 'class_session') {
      return handleClassAvailability(supabase, venueId, dateStr);
    }
    if (venueMode.bookingModel === 'resource_booking') {
      return handleResourceAvailability(supabase, venueId, dateStr, searchParams);
    }

    // Model A: table reservation
    const useServiceEngine = venueMode.availabilityEngine === 'service';

    if (!useServiceEngine) {
      return NextResponse.json({ error: AVAILABILITY_SETUP_REQUIRED_MESSAGE }, { status: 503 });
    }

    const engineInput = await fetchEngineInput({
      supabase,
      venueId,
      date: dateStr,
      partySize: partySize ?? 2,
    });

    const results = computeAvailability(engineInput);

    let activeResults = results.filter((r) => r.slots.length > 0 || r.large_party_redirect);
    let allSlots = activeResults.flatMap((r) => r.slots);

    if (venueMode.tableManagementEnabled) {
      const tablePartySize = partySize ?? 2;
      const timesWithTable = await buildTableFilterByTime(
        supabase,
        venueId,
        dateStr,
        allSlots.map((slot) => ({
          start_time: slot.start_time,
          end_time: slot.end_time,
        })),
        tablePartySize,
      );

      activeResults = activeResults.map((serviceResult) => ({
        ...serviceResult,
        slots: serviceResult.slots.filter((slot) => timesWithTable.has(slot.start_time)),
      })).filter((serviceResult) => serviceResult.slots.length > 0 || serviceResult.large_party_redirect);
      allSlots = activeResults.flatMap((r) => r.slots);
    }

    allSlots.sort((a, b) => a.start_time.localeCompare(b.start_time));

    const largePartyRedirect = activeResults.find((r) => r.large_party_redirect);

    return NextResponse.json({
      date: dateStr,
      venue_id: venueId,
      slots: allSlots,
      services: activeResults.map((r) => ({
        id: r.service.id,
        name: r.service.name,
        slots: r.slots,
        large_party_redirect: r.large_party_redirect,
        large_party_message: r.large_party_message,
      })),
      large_party_redirect: largePartyRedirect?.large_party_redirect ?? false,
      large_party_message: largePartyRedirect?.large_party_message ?? null,
    });
  } catch (error) {
    console.error('Availability fetch failed:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// Model B: Practitioner appointment availability
// ---------------------------------------------------------------------------
async function handleAppointmentAvailability(
  supabase: ReturnType<typeof getSupabaseAdminClient>,
  venueId: string,
  date: string,
  searchParams: URLSearchParams,
) {
  const practitionerId = searchParams.get('practitioner_id') ?? undefined;
  const serviceId = searchParams.get('service_id') ?? undefined;

  const input = await fetchAppointmentInput({ supabase, venueId, date, practitionerId, serviceId });
  const result = computeAppointmentAvailability(input);

  return NextResponse.json({ date, venue_id: venueId, ...result });
}

// ---------------------------------------------------------------------------
// Model C: Event / experience availability
// ---------------------------------------------------------------------------
async function handleEventAvailability(
  supabase: ReturnType<typeof getSupabaseAdminClient>,
  venueId: string,
  date: string,
) {
  const input = await fetchEventInput({ supabase, venueId, date });
  const result = computeEventAvailability(input);

  return NextResponse.json({ date, venue_id: venueId, events: result });
}

// ---------------------------------------------------------------------------
// Model D: Class session availability
// ---------------------------------------------------------------------------
async function handleClassAvailability(
  supabase: ReturnType<typeof getSupabaseAdminClient>,
  venueId: string,
  date: string,
) {
  const input = await fetchClassInput({ supabase, venueId, date });
  const result = computeClassAvailability(input);

  return NextResponse.json({ date, venue_id: venueId, classes: result });
}

// ---------------------------------------------------------------------------
// Model E: Resource booking availability
// ---------------------------------------------------------------------------
async function handleResourceAvailability(
  supabase: ReturnType<typeof getSupabaseAdminClient>,
  venueId: string,
  date: string,
  searchParams: URLSearchParams,
) {
  const resourceId = searchParams.get('resource_id') ?? undefined;
  const durationMinutes = parseInt(searchParams.get('duration') ?? '60', 10) || 60;

  const input = await fetchResourceInput({ supabase, venueId, date, resourceId });
  const result = computeResourceAvailability(input, durationMinutes);

  return NextResponse.json({ date, venue_id: venueId, resources: result });
}
