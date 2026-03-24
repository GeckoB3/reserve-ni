import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getVenueStaff } from '@/lib/venue-auth';
import {
  computeAvailability,
  computeEffectiveMinSlotCoverCap,
  fetchEngineInput,
  resolveServiceForDate,
  timeToMinutes,
  getDayOfWeek,
} from '@/lib/availability';
import { nowInVenueTz, dietarySummary } from '@/lib/day-sheet';
import { resolveVenueMode } from '@/lib/venue-mode';

interface DaySheetBookingRow {
  id: string;
  booking_time: string;
  estimated_end_time: string | null;
  party_size: number;
  status: string;
  source: string;
  deposit_status: string;
  deposit_amount_pence: number | null;
  dietary_notes: string | null;
  special_requests: string | null;
  internal_notes: string | null;
  occasion: string | null;
  guest_id: string;
  created_at: string;
  booking_date: string;
}

export interface DaySheetBooking {
  id: string;
  booking_time: string;
  estimated_end_time: string | null;
  party_size: number;
  status: string;
  source: string;
  deposit_status: string;
  deposit_amount_pence: number | null;
  dietary_notes: string | null;
  special_requests: string | null;
  internal_notes: string | null;
  occasion: string | null;
  guest_name: string;
  guest_phone: string | null;
  guest_email: string | null;
  guest_id: string;
  visit_count: number;
  no_show_count: number;
  last_visit_date: string | null;
  created_at: string;
}

export interface DaySheetPeriod {
  key: string;
  label: string;
  start_time: string;
  end_time: string;
  max_covers: number | null;
  booked_covers: number;
  bookings: DaySheetBooking[];
}

function timeStr(t: string): string {
  return typeof t === 'string' ? t.slice(0, 5) : '12:00';
}

const ACTIVE_STATUSES = ['Pending', 'Confirmed', 'Seated'];

/**
 * GET /api/venue/day-sheet?date=YYYY-MM-DD
 * Returns comprehensive day sheet data: periods with capacity, extended booking data,
 * guest history, and summary statistics.
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const staff = await getVenueStaff(supabase);
    if (!staff) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    }

    const { data: venue, error: venueErr } = await staff.db
      .from('venues')
      .select('id, name, timezone, table_management_enabled, no_show_grace_minutes')
      .eq('id', staff.venue_id)
      .single();

    if (venueErr || !venue) {
      return NextResponse.json({ error: 'Venue not found' }, { status: 500 });
    }

    const tz = (venue.timezone as string) ?? 'Europe/London';
    const now = nowInVenueTz(tz);

    const requestedDate = request.nextUrl.searchParams.get('date');
    const dateStr = requestedDate && /^\d{4}-\d{2}-\d{2}$/.test(requestedDate)
      ? requestedDate
      : now.dateStr;

    const { data: bookingRows, error: bookErr } = await staff.db
      .from('bookings')
      .select('*')
      .eq('venue_id', staff.venue_id)
      .eq('booking_date', dateStr);

    if (bookErr) {
      console.error('GET /api/venue/day-sheet bookings failed:', bookErr);
      return NextResponse.json({ error: 'Failed to load bookings' }, { status: 500 });
    }

    const allBookings: DaySheetBookingRow[] = (bookingRows ?? []).map((b: Record<string, unknown>) => ({
      id: b.id as string,
      booking_time: timeStr(b.booking_time as string),
      estimated_end_time: b.estimated_end_time ? timeStr(b.estimated_end_time as string) : null,
      party_size: b.party_size as number,
      status: b.status as string,
      source: (b.source as string) ?? 'Phone',
      deposit_status: (b.deposit_status as string) ?? 'N/A',
      deposit_amount_pence: (b.deposit_amount_pence as number | null) ?? null,
      dietary_notes: (b.dietary_notes as string | null) ?? null,
      special_requests: (b.special_requests as string | null) ?? null,
      internal_notes: (b.internal_notes as string | null) ?? null,
      occasion: (b.occasion as string | null) ?? null,
      guest_id: b.guest_id as string,
      created_at: b.created_at as string,
      booking_date: b.booking_date as string,
    }));

    // Fetch guest details with visit history
    const guestIds = [...new Set(allBookings.map((b) => b.guest_id))];
    const { data: guestRows } = guestIds.length
      ? await staff.db
          .from('guests')
          .select('id, name, email, phone, visit_count, no_show_count, last_visit_date')
          .in('id', guestIds)
      : { data: [] };
    const guestMap = new Map(
      (guestRows ?? []).map((g: {
        id: string;
        name: string | null;
        email: string | null;
        phone: string | null;
        visit_count: number | null;
        no_show_count: number | null;
        last_visit_date: string | null;
      }) => [g.id, g]),
    );

    function toSheetBooking(row: DaySheetBookingRow): DaySheetBooking {
      const guest = guestMap.get(row.guest_id);
      return {
        id: row.id,
        booking_time: row.booking_time,
        estimated_end_time: row.estimated_end_time,
        party_size: row.party_size,
        status: row.status,
        source: row.source,
        deposit_status: row.deposit_status,
        deposit_amount_pence: row.deposit_amount_pence,
        dietary_notes: row.dietary_notes,
        special_requests: row.special_requests,
        internal_notes: row.internal_notes,
        occasion: row.occasion,
        guest_name: guest?.name?.trim() || 'Walk-in',
        guest_phone: guest?.phone ?? null,
        guest_email: guest?.email ?? null,
        guest_id: row.guest_id,
        visit_count: guest?.visit_count ?? 0,
        no_show_count: guest?.no_show_count ?? 0,
        last_visit_date: guest?.last_visit_date ?? null,
        created_at: row.created_at,
      };
    }

    // Resolve service periods
    const venueMode = await resolveVenueMode(staff.db, staff.venue_id);
    let periods: DaySheetPeriod[] = [];
    let capacityConfigured = false;
    let serviceDurationMin: number | null = null;

    // Track assigned booking IDs to prevent a booking from appearing in multiple periods
    const assignedBookingIds = new Set<string>();

    if (venueMode.availabilityEngine === 'service') {
      const engineInput = await fetchEngineInput({
        supabase: staff.db,
        venueId: staff.venue_id,
        date: dateStr,
        partySize: 1,
      });
      const serviceResults = computeAvailability(engineInput);
      if (engineInput.durations.length > 0) {
        serviceDurationMin = engineInput.durations[0]!.duration_minutes;
      }

      const dayOfWeek = getDayOfWeek(dateStr);

      for (const result of serviceResults) {
        const service = result.service;

        const effectiveService = resolveServiceForDate(
          service,
          engineInput.schedule_exceptions,
          staff.venue_id,
          dateStr,
          dayOfWeek,
        );
        if (!effectiveService) continue;

        const startMin = timeToMinutes(effectiveService.start_time);
        const endMin = timeToMinutes(effectiveService.end_time);

        const rules = engineInput.capacity_rules.filter((r) => r.service_id === service.id);
        const dayRule = rules.find((r) => r.day_of_week === dayOfWeek && !r.time_range_start);
        const defaultRule = rules.find((r) => r.day_of_week == null && !r.time_range_start);
        const rule = dayRule ?? defaultRule;

        const effectiveMax = computeEffectiveMinSlotCoverCap(
          engineInput,
          service,
          effectiveService,
          dayOfWeek,
        );
        const maxCovers = effectiveMax ?? rule?.max_covers_per_slot ?? null;
        if (maxCovers != null) capacityConfigured = true;

        const periodBookings = allBookings
          .filter((b) => {
            if (assignedBookingIds.has(b.id)) return false;
            const bMin = timeToMinutes(b.booking_time);
            return bMin >= startMin && bMin < endMin;
          })
          .map((b) => { assignedBookingIds.add(b.id); return b; })
          .map(toSheetBooking)
          .sort((a, b) => a.booking_time.localeCompare(b.booking_time));

        const bookedCovers = periodBookings
          .filter((b) => ACTIVE_STATUSES.includes(b.status))
          .reduce((sum, b) => sum + b.party_size, 0);

        periods.push({
          key: service.id,
          label: service.name,
          start_time: effectiveService.start_time.slice(0, 5),
          end_time: effectiveService.end_time.slice(0, 5),
          max_covers: maxCovers,
          booked_covers: bookedCovers,
          bookings: periodBookings,
        });
      }
    } else {
      const mapped = allBookings
        .map((b) => {
          assignedBookingIds.add(b.id);
          return b;
        })
        .map(toSheetBooking)
        .sort((a, b) => a.booking_time.localeCompare(b.booking_time));

      const bookedCovers = mapped
        .filter((b) => ACTIVE_STATUSES.includes(b.status))
        .reduce((sum, b) => sum + b.party_size, 0);

      periods.push({
        key: 'all',
        label: 'All Bookings',
        start_time: '00:00',
        end_time: '23:59',
        max_covers: null,
        booked_covers: bookedCovers,
        bookings: mapped,
      });
    }

    // Assign bookings not falling in any period to an "Other" group
    const unassigned = allBookings.filter((b) => !assignedBookingIds.has(b.id));
    if (unassigned.length > 0) {
      const mapped = unassigned.map(toSheetBooking).sort((a, b) => a.booking_time.localeCompare(b.booking_time));
      const bookedCovers = mapped
        .filter((b) => ACTIVE_STATUSES.includes(b.status))
        .reduce((sum, b) => sum + b.party_size, 0);
      periods.push({
        key: 'other',
        label: 'Other',
        start_time: '00:00',
        end_time: '23:59',
        max_covers: null,
        booked_covers: bookedCovers,
        bookings: mapped,
      });
    }

    // Summary — deduplicate by booking ID as a safety net
    const allMappedRaw = periods.flatMap((p) => p.bookings);
    const seenIds = new Set<string>();
    const allMapped = allMappedRaw.filter((b) => {
      if (seenIds.has(b.id)) return false;
      seenIds.add(b.id);
      return true;
    });
    const totalBookings = allMapped.filter((b) => b.status !== 'Cancelled').length;
    const totalCovers = allMapped
      .filter((b) => ACTIVE_STATUSES.includes(b.status))
      .reduce((s, b) => s + b.party_size, 0);
    const pendingCount = allMapped.filter((b) => b.status === 'Pending').length;
    const seatedCovers = allMapped
      .filter((b) => b.status === 'Seated')
      .reduce((s, b) => s + b.party_size, 0);
    const completedCovers = allMapped
      .filter((b) => b.status === 'Completed')
      .reduce((s, b) => s + b.party_size, 0);
    const noShowCovers = allMapped
      .filter((b) => b.status === 'No-Show')
      .reduce((s, b) => s + b.party_size, 0);
    const cancelledCovers = allMapped
      .filter((b) => b.status === 'Cancelled')
      .reduce((s, b) => s + b.party_size, 0);

    // Venue-level max CONCURRENT capacity (physical seats — the most covers that can be
    // seated at the same time). Use MAX across periods, not SUM, because all periods
    // share the same physical space.
    let venueMaxCapacity: number | null = null;
    if (capacityConfigured && venueMode.availabilityEngine === 'service') {
      const caps = periods.map((p) => p.max_covers ?? 0).filter((c) => c > 0);
      venueMaxCapacity = caps.length > 0 ? Math.max(...caps) : null;
    }

    const coversRemaining = venueMaxCapacity != null ? Math.max(0, venueMaxCapacity - totalCovers) : null;

    // Time-aware fields (meaningful when viewing today)
    const isToday = dateStr === now.dateStr;
    const nowMinutes = now.minutesSinceMidnight;

    let defaultDurationMin = 90;
    if (serviceDurationMin != null) {
      defaultDurationMin = serviceDurationMin;
    }

    // Covers currently in use (Seated right now)
    const coversInUse = seatedCovers;

    // Available right now: venue capacity minus seated covers
    const coversAvailableNow = venueMaxCapacity != null ? Math.max(0, venueMaxCapacity - coversInUse) : null;

    // Covers freeing up in next 30 minutes (seated bookings whose estimated end time is within 30 mins)
    const freeingSoon = isToday
      ? allMapped
          .filter((b) => {
            if (b.status !== 'Seated') return false;
            const startMin = timeToMinutes(b.booking_time);
            const endMin = b.estimated_end_time
              ? timeToMinutes(b.estimated_end_time)
              : startMin + defaultDurationMin;
            return endMin > nowMinutes && endMin <= nowMinutes + 30;
          })
          .reduce((s, b) => s + b.party_size, 0)
      : 0;

    // Covers arriving in next 30 minutes (confirmed/pending bookings about to start)
    const arrivingSoon = isToday
      ? allMapped
          .filter((b) => {
            if (b.status !== 'Confirmed' && b.status !== 'Pending') return false;
            const startMin = timeToMinutes(b.booking_time);
            return startMin > nowMinutes && startMin <= nowMinutes + 30;
          })
          .reduce((s, b) => s + b.party_size, 0)
      : 0;

    // Fetch active venue tables for table status strip + selector
    const { data: venueTablesRows } = await staff.db
      .from('venue_tables')
      .select('id, name, max_covers, sort_order')
      .eq('venue_id', staff.venue_id)
      .eq('is_active', true)
      .order('sort_order');
    const activeTables = (venueTablesRows ?? []).map((t: { id: string; name: string; max_covers: number; sort_order: number }) => ({
      id: t.id,
      name: t.name,
      max_covers: t.max_covers,
      sort_order: t.sort_order,
    }));

    // Fetch table assignments for today's bookings
    const bookingIds = allBookings.map((b) => b.id);
    let assignmentsMap = new Map<string, Array<{ id: string; name: string }>>();
    if (bookingIds.length > 0 && activeTables.length > 0) {
      const { data: assignRows } = await staff.db
        .from('booking_table_assignments')
        .select('booking_id, table_id, table:venue_tables(id, name)')
        .in('booking_id', bookingIds);
      for (const row of assignRows ?? []) {
        const r = row as unknown as { booking_id: string; table_id: string; table: Array<{ id: string; name: string }> | { id: string; name: string } | null };
        const tableObj = Array.isArray(r.table) ? r.table[0] : r.table;
        const existing = assignmentsMap.get(r.booking_id) ?? [];
        existing.push({ id: tableObj?.id ?? r.table_id, name: tableObj?.name ?? 'Unknown' });
        assignmentsMap.set(r.booking_id, existing);
      }
    }

    // Attach table_assignments to each booking in periods
    for (const period of periods) {
      for (const booking of period.bookings) {
        (booking as DaySheetBooking & { table_assignments?: Array<{ id: string; name: string }> }).table_assignments =
          assignmentsMap.get(booking.id) ?? [];
      }
    }

    // Dietary summary (only active bookings — includes special_requests for allergy detection)
    const dietaryInput = allBookings
      .filter((b) => ACTIVE_STATUSES.includes(b.status))
      .map((b) => ({ dietary_notes: b.dietary_notes, occasion: b.occasion, special_requests: b.special_requests }));
    const dietary = dietarySummary(dietaryInput);

    return NextResponse.json({
      date: dateStr,
      venue_name: (venue.name as string) ?? '',
      periods,
      summary: {
        total_bookings: totalBookings,
        total_covers: totalCovers,
        covers_remaining: coversRemaining,
        pending_count: pendingCount,
        seated_covers: seatedCovers,
        completed_covers: completedCovers,
        no_show_covers: noShowCovers,
        cancelled_covers: cancelledCovers,
        venue_max_capacity: venueMaxCapacity,
        covers_in_use: coversInUse,
        covers_available_now: coversAvailableNow,
        freeing_soon: freeingSoon,
        arriving_soon: arrivingSoon,
        is_today: isToday,
        default_duration_minutes: defaultDurationMin,
      },
      dietary_summary: dietary,
      no_show_grace_minutes: Math.min(60, Math.max(10, venue.no_show_grace_minutes ?? 15)),
      capacity_configured: capacityConfigured,
      active_tables: activeTables,
    });
  } catch (err) {
    console.error('GET /api/venue/day-sheet failed:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
