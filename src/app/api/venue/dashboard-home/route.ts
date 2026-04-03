import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getVenueStaff } from '@/lib/venue-auth';
import { getSupabaseAdminClient } from '@/lib/supabase';
import { nowInVenueTz } from '@/lib/day-sheet';
import { getDayOfWeek, fetchEngineInput } from '@/lib/availability';
import {
  peakOverlappingCovers,
  resolveOpeningWindowMinutes,
  coversOverlappingNow,
  coversArrivingWithin,
  resolveVenueConcurrentCapLegacy,
  type DashboardLoadBooking,
} from '@/lib/dashboard/load-metrics';
import {
  resolveServiceEngineConcurrentCapFromInput,
  defaultDurationForDashboardDay,
} from '@/lib/dashboard/resolve-venue-concurrent-cap';
import { resolveVenueMode } from '@/lib/venue-mode';
import { computeGuestBookingReady } from '@/lib/setup-guest-booking-ready';
import type { AvailabilityConfig, EngineInput, OpeningHours } from '@/types/availability';
import type { BookingModel } from '@/types/booking-models';
import { isUnifiedSchedulingVenue } from '@/lib/booking/unified-scheduling';
import { inferBookingRowModel, bookingModelShortLabel } from '@/lib/booking/infer-booking-row-model';
import { BOOKING_MODEL_ORDER, normalizeEnabledModels } from '@/lib/booking/enabled-models';
const WEEKDAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function addDaysToDateStr(dateStr: string, delta: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + delta));
  return t.toISOString().slice(0, 10);
}

function weekdayShortForDateStr(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return WEEKDAYS_SHORT[wd]!;
}

/** Primary plus enabled secondaries, stable order; used so today counts include explicit zeros per active model. */
function activeBookingModelsInOrder(primary: BookingModel, enabled: BookingModel[]): BookingModel[] {
  const active = new Set<BookingModel>([primary, ...enabled]);
  return BOOKING_MODEL_ORDER.filter((m) => active.has(m));
}

function mergeTodayByModelWithActiveModels(
  counts: Record<string, number>,
  primary: BookingModel,
  enabled: BookingModel[],
): Record<string, number> {
  const ordered = activeBookingModelsInOrder(primary, enabled);
  const out: Record<string, number> = {};
  for (const m of ordered) {
    out[m] = counts[m] ?? 0;
  }
  for (const [k, v] of Object.entries(counts)) {
    if (out[k] === undefined) out[k] = v;
  }
  return out;
}

function toLoadBookings(
  rows: Array<{
    booking_time: string;
    party_size: number;
    status: string;
    estimated_end_time?: string | null;
  }>,
): DashboardLoadBooking[] {
  return rows.map((b) => ({
    booking_time: typeof b.booking_time === 'string' ? b.booking_time : '',
    party_size: b.party_size,
    status: b.status,
    estimated_end_time: b.estimated_end_time ?? null,
  }));
}

/** GET /api/venue/dashboard-home - summary data for the dashboard home page */
export async function GET() {
  try {
    const supabase = await createClient();
    const staff = await getVenueStaff(supabase);
    if (!staff) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

    const admin = getSupabaseAdminClient();

    const { data: venueRow, error: venueErr } = await admin
      .from('venues')
      .select('availability_config, opening_hours, timezone, booking_model, enabled_models')
      .eq('id', staff.venue_id)
      .single();

    if (venueErr || !venueRow) {
      console.error('GET /api/venue/dashboard-home venue failed:', venueErr);
      return NextResponse.json({ error: 'Venue not found' }, { status: 500 });
    }

    const tz = (venueRow.timezone as string) ?? 'Europe/London';
    const { dateStr: todayStrVenue, minutesSinceMidnight: nowMinutes } = nowInVenueTz(tz);
    const weekEndStr = addDaysToDateStr(todayStrVenue, 6);

    const availabilityConfig = venueRow.availability_config as AvailabilityConfig | null;
    const openingHours = venueRow.opening_hours;
    const venueMode = await resolveVenueMode(admin, staff.venue_id);
    const engine: 'legacy' | 'service' = venueMode.availabilityEngine === 'service' ? 'service' : 'legacy';

    const dateStrs = Array.from({ length: 7 }, (_, i) => addDaysToDateStr(todayStrVenue, i));

    let engineInputsByDate: Map<string, EngineInput> | null = null;
    if (engine === 'service') {
      const inputs = await Promise.all(
        dateStrs.map((d) =>
          fetchEngineInput({
            supabase: admin,
            venueId: staff.venue_id,
            date: d,
            partySize: 1,
          }),
        ),
      );
      engineInputsByDate = new Map(dateStrs.map((d, i) => [d, inputs[i]!]));
    }

    const bookingListCols =
      'id, booking_time, party_size, status, deposit_amount_pence, guest_id, estimated_end_time, deposit_status, experience_event_id, class_instance_id, resource_id, event_session_id, calendar_id, service_item_id, practitioner_id, appointment_service_id';

    const [todayBookingsRes, weekBookingsRes] = await Promise.all([
      admin
        .from('bookings')
        .select(bookingListCols)
        .eq('venue_id', staff.venue_id)
        .eq('booking_date', todayStrVenue)
        .in('status', ['Confirmed', 'Pending', 'Seated']),
      admin
        .from('bookings')
        .select(
          `id, booking_date, booking_time, party_size, status, deposit_amount_pence, guest_id, estimated_end_time, deposit_status, experience_event_id, class_instance_id, resource_id, event_session_id, calendar_id, service_item_id, practitioner_id, appointment_service_id`,
        )
        .eq('venue_id', staff.venue_id)
        .gte('booking_date', todayStrVenue)
        .lte('booking_date', weekEndStr)
        .in('status', ['Confirmed', 'Pending', 'Seated']),
    ]);

    const todayBookings = todayBookingsRes.data ?? [];
    const weekBookings = weekBookingsRes.data ?? [];

    const todayByModel: Record<string, number> = {};
    for (const b of todayBookings) {
      const row = b as Record<string, unknown>;
      const m = inferBookingRowModel({
        experience_event_id: row.experience_event_id as string | null | undefined,
        class_instance_id: row.class_instance_id as string | null | undefined,
        resource_id: row.resource_id as string | null | undefined,
        event_session_id: row.event_session_id as string | null | undefined,
        calendar_id: row.calendar_id as string | null | undefined,
        service_item_id: row.service_item_id as string | null | undefined,
        practitioner_id: row.practitioner_id as string | null | undefined,
        appointment_service_id: row.appointment_service_id as string | null | undefined,
      });
      todayByModel[m] = (todayByModel[m] ?? 0) + 1;
    }

    const todayCovers = todayBookings.reduce((sum, b) => sum + b.party_size, 0);
    const todayBookingCount = todayBookings.length;
    const todayRevenue = todayBookings.reduce((sum, b) => sum + (b.deposit_amount_pence ?? 0), 0) / 100;
    const confirmedCount = todayBookings.filter((b) => b.status === 'Confirmed').length;
    const pendingCount = todayBookings.filter((b) => b.status === 'Pending').length;
    const seatedCount = todayBookings.filter((b) => b.status === 'Seated').length;

    let nextBooking: { time: string; party_size: number } | null = null;
    for (const b of [...todayBookings].sort((a, b) => String(a.booking_time).localeCompare(String(b.booking_time)))) {
      const t = String(b.booking_time);
      const [h, m] = t.split(':').map(Number);
      if ((h ?? 0) * 60 + (m ?? 0) > nowMinutes) {
        nextBooking = { time: t.slice(0, 5), party_size: b.party_size };
        break;
      }
    }

    const forecast: Array<{ date: string; day: string; covers: number; bookings: number }> = [];
    for (const dateStr of dateStrs) {
      const dayBookings = weekBookings.filter((b) => b.booking_date === dateStr);
      forecast.push({
        date: dateStr,
        day: weekdayShortForDateStr(dateStr),
        covers: dayBookings.reduce((sum, b) => sum + b.party_size, 0),
        bookings: dayBookings.length,
      });
    }

    const caps: Array<number | null> = dateStrs.map((dateStr) => {
      if (engine === 'service' && engineInputsByDate) {
        const input = engineInputsByDate.get(dateStr);
        if (!input) return null;
        return resolveServiceEngineConcurrentCapFromInput(input, staff.venue_id, dateStr);
      }
      return resolveVenueConcurrentCapLegacy(availabilityConfig, dateStr);
    });

    const heatmap: Array<{
      date: string;
      day: string;
      daily_total_covers: number;
      peak_in_house_covers: number;
      concurrent_cap: number | null;
      fill_percent: number | null;
    }> = [];

    for (let i = 0; i < 7; i++) {
      const dateStr = dateStrs[i]!;
      const dayBookings = weekBookings.filter((b) => b.booking_date === dateStr);
      const engineInput = engine === 'service' ? engineInputsByDate?.get(dateStr) ?? null : null;
      const defaultDur = defaultDurationForDashboardDay(engine, engineInput, availabilityConfig);

      const dayOfWeek = getDayOfWeek(dateStr);
      const window = resolveOpeningWindowMinutes(openingHours as OpeningHours | null, dayOfWeek);
      const earliestMin = window?.startMin ?? 11 * 60;
      const latestMin = window?.endMin ?? 23 * 60;

      const peak = peakOverlappingCovers(toLoadBookings(dayBookings), {
        earliestMin,
        latestMin,
        stepMinutes: 30,
        defaultDurationMinutes: defaultDur,
      });

      const cap = caps[i] ?? null;
      const fillPercent = cap != null && cap > 0 ? Math.min(100, Math.round((peak / cap) * 100)) : null;

      heatmap.push({
        date: dateStr,
        day: forecast[i]!.day,
        daily_total_covers: forecast[i]!.covers ?? 0,
        peak_in_house_covers: peak ?? 0,
        concurrent_cap: cap ?? null,
        fill_percent: fillPercent ?? null,
      });
    }

    const todayHeat = heatmap[0]!;
    const todayEngineInput = engine === 'service' ? engineInputsByDate?.get(todayStrVenue) ?? null : null;
    const todayDefaultDur = defaultDurationForDashboardDay(engine, todayEngineInput, availabilityConfig);
    const todayLoadBookings = toLoadBookings(todayBookings);

    const coversInHouseNow = coversOverlappingNow(todayLoadBookings, nowMinutes, todayDefaultDur);
    const arrivingWithin30 = coversArrivingWithin(todayLoadBookings, nowMinutes, 30, todayDefaultDur);

    const venueBookingModel = ((venueRow as Record<string, unknown>).booking_model as string) ?? 'table_reservation';
    const isAppt = isUnifiedSchedulingVenue(venueBookingModel as BookingModel);
    const alerts: Array<{ type: string; message: string }> = [];

    if (
      staff.role === 'admin' &&
      (venueBookingModel === 'table_reservation' || isUnifiedSchedulingVenue(venueBookingModel as BookingModel))
    ) {
      const guestReady = await computeGuestBookingReady(
        admin,
        staff.venue_id,
        venueBookingModel as BookingModel,
        true,
      );
      if (!guestReady) {
        alerts.push({
          type: 'warning',
          message:
            isUnifiedSchedulingVenue(venueBookingModel as BookingModel)
              ? 'Public bookings are off until at least one team member has an active linked service. Open Appointment Services to finish setup.'
              : 'Public table booking is off until you have at least one active service and availability configured. Use the setup wizard or Availability.',
        });
      }
    }
    if (
      venueBookingModel === 'table_reservation' &&
      todayHeat.fill_percent != null &&
      todayHeat.fill_percent >= 80
    ) {
      alerts.push({
        type: 'warning',
        message: `Today is ${todayHeat.fill_percent}% full at the busiest time (${todayHeat.peak_in_house_covers ?? 0}${todayHeat.concurrent_cap != null ? ` of ${todayHeat.concurrent_cap}` : ''} covers) - walk-in availability may be limited.`,
      });
    }
    if (todayBookings.some((b) => b.status === 'Pending')) {
      const pendingCount = todayBookings.filter((b) => b.status === 'Pending').length;
      alerts.push({ type: 'info', message: `${pendingCount} pending ${isAppt ? 'appointment' : 'booking'}${pendingCount > 1 ? 's' : ''} awaiting payment.` });
    }
    const tomorrow = forecast[1];
    if (tomorrow && tomorrow.bookings === 0) {
      alerts.push({ type: 'info', message: `No ${isAppt ? 'appointments' : 'bookings'} yet for tomorrow (${tomorrow.day}).` });
    }

    const guestIds = [...new Set(todayBookings.slice(0, 10).map((b) => b.guest_id).filter(Boolean))] as string[];
    const guestNameById = new Map<string, string>();
    if (guestIds.length > 0) {
      const { data: guests } = await admin.from('guests').select('id, name').in('id', guestIds);
      for (const g of guests ?? []) {
        guestNameById.set((g as { id: string; name: string | null }).id, (g as { name: string | null }).name?.trim() || 'Guest');
      }
    }

    const sortedTodayBookings = [...todayBookings].sort((a, b) =>
      String(a.booking_time).localeCompare(String(b.booking_time)),
    );

    const primaryBm = ((venueRow as Record<string, unknown>).booking_model as BookingModel) ?? 'table_reservation';
    const enabledModelsNorm = normalizeEnabledModels(
      (venueRow as { enabled_models?: unknown }).enabled_models,
      primaryBm,
    );
    const todayByModelMerged = mergeTodayByModelWithActiveModels(todayByModel, primaryBm, enabledModelsNorm);

    return NextResponse.json({
      booking_model: (venueRow as Record<string, unknown>).booking_model ?? 'table_reservation',
      enabled_models: enabledModelsNorm,
      today_by_booking_model: todayByModelMerged,
      today: {
        covers: todayCovers ?? 0,
        bookings: todayBookingCount ?? 0,
        confirmed: confirmedCount ?? 0,
        pending: pendingCount ?? 0,
        seated: seatedCount ?? 0,
        revenue: todayRevenue ?? 0,
        next_booking: nextBooking,
        peak_in_house_covers: todayHeat.peak_in_house_covers ?? 0,
        concurrent_cap: todayHeat.concurrent_cap ?? null,
        peak_fill_percent: todayHeat.fill_percent ?? null,
        covers_in_house_now: coversInHouseNow ?? 0,
        arriving_within_30_min: arrivingWithin30 ?? 0,
      },
      forecast,
      heatmap,
      alerts,
      recent_bookings: sortedTodayBookings.slice(0, 10).map((b) => {
        const row = b as Record<string, unknown>;
        const m = inferBookingRowModel({
          experience_event_id: row.experience_event_id as string | null | undefined,
          class_instance_id: row.class_instance_id as string | null | undefined,
          resource_id: row.resource_id as string | null | undefined,
          event_session_id: row.event_session_id as string | null | undefined,
          calendar_id: row.calendar_id as string | null | undefined,
          service_item_id: row.service_item_id as string | null | undefined,
          practitioner_id: row.practitioner_id as string | null | undefined,
          appointment_service_id: row.appointment_service_id as string | null | undefined,
        });
        return {
          id: b.id,
          time: typeof b.booking_time === 'string' ? b.booking_time.slice(0, 5) : '',
          party_size: b.party_size,
          status: b.status,
          guest_name: b.guest_id ? (guestNameById.get(b.guest_id) ?? 'Guest') : 'Guest',
          deposit_status: (b.deposit_status as string | undefined) ?? 'N/A',
          booking_model: m,
          kind_label: bookingModelShortLabel(m),
        };
      }),
    });
  } catch (err) {
    console.error('GET /api/venue/dashboard-home failed:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
