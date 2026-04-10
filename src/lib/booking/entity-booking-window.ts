/**
 * Per-service / per-entity booking window fields (DB columns on service_items, appointment_services,
 * experience_events, class_types, unified_calendars for resources, booking_restrictions for table).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { formatYmdInTimezone } from '@/lib/venue/venue-local-clock';

export interface EntityBookingWindow {
  max_advance_booking_days: number;
  min_booking_notice_hours: number;
  cancellation_notice_hours: number;
  allow_same_day_booking: boolean;
}

export const DEFAULT_ENTITY_BOOKING_WINDOW: EntityBookingWindow = {
  max_advance_booking_days: 90,
  min_booking_notice_hours: 1,
  cancellation_notice_hours: 48,
  allow_same_day_booking: true,
};

/** Parse from a DB row that may include the four columns (snake_case). */
export function entityBookingWindowFromRow(row: Record<string, unknown> | null | undefined): EntityBookingWindow {
  if (!row || typeof row !== 'object') return { ...DEFAULT_ENTITY_BOOKING_WINDOW };
  const maxD = row.max_advance_booking_days;
  const minN = row.min_booking_notice_hours;
  const cancel = row.cancellation_notice_hours;
  const same = row.allow_same_day_booking;
  return {
    max_advance_booking_days:
      typeof maxD === 'number' && Number.isFinite(maxD) ? Math.min(365, Math.max(1, maxD)) : DEFAULT_ENTITY_BOOKING_WINDOW.max_advance_booking_days,
    min_booking_notice_hours:
      typeof minN === 'number' && Number.isFinite(minN) ? Math.min(168, Math.max(0, minN)) : DEFAULT_ENTITY_BOOKING_WINDOW.min_booking_notice_hours,
    cancellation_notice_hours:
      typeof cancel === 'number' && Number.isFinite(cancel) ? Math.min(168, Math.max(0, cancel)) : DEFAULT_ENTITY_BOOKING_WINDOW.cancellation_notice_hours,
    allow_same_day_booking: typeof same === 'boolean' ? same : DEFAULT_ENTITY_BOOKING_WINDOW.allow_same_day_booking,
  };
}

function daysBetweenCalendarYmd(a: string, b: string): number {
  const [y1, m1, d1] = a.split('-').map(Number);
  const [y2, m2, d2] = b.split('-').map(Number);
  const t1 = Date.UTC(y1!, m1! - 1, d1!);
  const t2 = Date.UTC(y2!, m2! - 1, d2!);
  return Math.round((t2 - t1) / 86400000);
}

/** True when bookingDate is today or later in venue TZ, within maxAdvanceDays of venue-local today, and same-day rule passes. */
export function isGuestBookingDateAllowed(
  bookingDateYmd: string,
  window: EntityBookingWindow,
  venueTimezone: string,
  referenceNowMs = Date.now(),
): boolean {
  const tz = venueTimezone.trim() || 'Europe/London';
  const todayYmd = formatYmdInTimezone(referenceNowMs, tz);
  const diff = daysBetweenCalendarYmd(todayYmd, bookingDateYmd);
  if (diff < 0) return false;
  if (!window.allow_same_day_booking && bookingDateYmd === todayYmd) return false;
  return diff <= window.max_advance_booking_days;
}

/**
 * Staff walk-in / counter bookings: date must be within venue-local advance window, but same-day is allowed
 * even when `allow_same_day_booking` is false, as long as the slot/time is validated separately.
 */
export function isStaffWalkInBookingDateAllowed(
  bookingDateYmd: string,
  window: EntityBookingWindow,
  venueTimezone: string,
  referenceNowMs = Date.now(),
): boolean {
  const tz = venueTimezone.trim() || 'Europe/London';
  const todayYmd = formatYmdInTimezone(referenceNowMs, tz);
  const diff = daysBetweenCalendarYmd(todayYmd, bookingDateYmd);
  if (diff < 0) return false;
  return diff <= window.max_advance_booking_days;
}

const SERVICE_WINDOW_SELECT =
  'max_advance_booking_days, min_booking_notice_hours, cancellation_notice_hours, allow_same_day_booking';

/**
 * Loads booking window for an appointment service.
 * Tries `service_items` first (USE), then legacy `appointment_services`, so secondary-tab
 * appointments work when the venue primary is not `unified_scheduling`.
 */
export async function loadServiceEntityBookingWindow(
  supabase: SupabaseClient,
  venueId: string,
  _bookingModel: string,
  serviceId: string,
): Promise<EntityBookingWindow> {
  const { data: fromItems } = await supabase
    .from('service_items')
    .select(SERVICE_WINDOW_SELECT)
    .eq('id', serviceId)
    .eq('venue_id', venueId)
    .maybeSingle();
  if (fromItems) return entityBookingWindowFromRow(fromItems as Record<string, unknown>);

  const { data: fromLegacy } = await supabase
    .from('appointment_services')
    .select(SERVICE_WINDOW_SELECT)
    .eq('id', serviceId)
    .eq('venue_id', venueId)
    .maybeSingle();
  if (fromLegacy) return entityBookingWindowFromRow(fromLegacy as Record<string, unknown>);

  return { ...DEFAULT_ENTITY_BOOKING_WINDOW };
}
