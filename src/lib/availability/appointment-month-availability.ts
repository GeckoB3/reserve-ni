/**
 * Month-level appointment availability for the visual calendar date picker
 * (mirrors the resource `computeResourceAvailableDatesInMonth*` helpers).
 *
 * Strategy: evaluates each day in the target month by calling the existing
 * `fetchAppointmentInput` + `computeAppointmentAvailability` pipeline, capped
 * at a small concurrency ceiling so we do not flood the connection pool.
 *
 * Trade-off: this is simpler than a bespoke month-scoped prefetch but still
 * fast for a 28-31 day window (typically <1s on warm DB). When needed, upgrade
 * to a batched prefetcher (see resource-booking-engine for the pattern).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  attachVenueClockToAppointmentInput,
  computeAppointmentAvailability,
  fetchAppointmentInput,
} from '@/lib/availability/appointment-engine';
import {
  DEFAULT_ENTITY_BOOKING_WINDOW,
  type EntityBookingWindow,
  isGuestBookingDateAllowed,
  isStaffWalkInBookingDateAllowed,
  loadServiceEntityBookingWindow,
} from '@/lib/booking/entity-booking-window';

interface VenueClockRow {
  timezone?: string | null;
  booking_rules?: unknown;
  opening_hours?: unknown;
  venue_opening_exceptions?: unknown;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** Run `tasks` with at most `limit` in flight. Returns results in input order. */
async function mapWithConcurrency<T, R>(
  inputs: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(inputs.length);
  let cursor = 0;
  async function run() {
    while (true) {
      const i = cursor++;
      if (i >= inputs.length) return;
      results[i] = await worker(inputs[i]!, i);
    }
  }
  const workers: Promise<void>[] = [];
  const n = Math.max(1, Math.min(limit, inputs.length));
  for (let w = 0; w < n; w++) workers.push(run());
  await Promise.all(workers);
  return results;
}

export interface ComputeAppointmentMonthOptions {
  /** Staff audience allows same-day even when service rule says otherwise; defaults to public. */
  audience?: 'public' | 'staff';
  /** Max days evaluated in parallel. */
  concurrency?: number;
  /** Prefetched venue clock row to avoid an extra `venues` round-trip per call. */
  venueClockRow?: VenueClockRow | null;
  /** Prefetched booking window for the service, if already loaded. */
  bookingWindow?: EntityBookingWindow | null;
}

/**
 * Dates in the given month (YYYY-MM-DD) where `practitionerId` has at least one
 * bookable slot for `serviceId` under the service booking window.
 */
export async function computeAppointmentAvailableDatesInMonth(
  supabase: SupabaseClient,
  venueId: string,
  practitionerId: string,
  serviceId: string,
  year: number,
  month: number,
  options: ComputeAppointmentMonthOptions = {},
): Promise<string[]> {
  const audience = options.audience ?? 'public';
  const concurrency = options.concurrency ?? 6;

  const venueClockRow: VenueClockRow =
    options.venueClockRow ??
    ((
      await supabase
        .from('venues')
        .select('timezone, booking_rules, opening_hours, venue_opening_exceptions')
        .eq('id', venueId)
        .maybeSingle()
    ).data as VenueClockRow | null) ??
    {};

  const bookingWindow =
    options.bookingWindow ??
    (await loadServiceEntityBookingWindow(supabase, venueId, '', serviceId)) ??
    DEFAULT_ENTITY_BOOKING_WINDOW;

  const tz =
    typeof venueClockRow.timezone === 'string' && venueClockRow.timezone.trim() !== ''
      ? venueClockRow.timezone.trim()
      : 'Europe/London';

  const lastDay = new Date(year, month, 0).getDate();
  const dates: string[] = [];
  for (let d = 1; d <= lastDay; d++) {
    dates.push(`${year}-${pad2(month)}-${pad2(d)}`);
  }

  const allowed = (iso: string): boolean =>
    audience === 'staff'
      ? isStaffWalkInBookingDateAllowed(iso, bookingWindow, tz)
      : isGuestBookingDateAllowed(iso, bookingWindow, tz);

  const results = await mapWithConcurrency(dates, concurrency, async (date) => {
    if (!allowed(date)) return { date, available: false };
    try {
      const input = await fetchAppointmentInput({
        supabase,
        venueId,
        date,
        practitionerId,
        serviceId,
      });
      attachVenueClockToAppointmentInput(input, venueClockRow, bookingWindow);
      const out = computeAppointmentAvailability(input);
      const prac = out.practitioners.find((p) => p.id === practitionerId);
      const hasSlot = !!prac?.slots.some((s) => s.service_id === serviceId);
      return { date, available: hasSlot };
    } catch (err) {
      console.warn('[computeAppointmentAvailableDatesInMonth] day failed', { date, err });
      return { date, available: false };
    }
  });

  return results.filter((r) => r.available).map((r) => r.date);
}
