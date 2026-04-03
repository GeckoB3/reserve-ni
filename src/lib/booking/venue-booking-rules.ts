/**
 * Extended `venues.booking_rules` JSON (read path). Cancellation refund window uses global
 * `cancellation_notice_hours`; reminder lead times use `venues.notification_settings` (communications).
 */

import type { BookingModel } from '@/types/booking-models';
import type { VenueNotificationSettings } from '@/lib/notifications/notification-settings';

export interface ExtendedBookingRules {
  cancellation_notice_hours?: number;
}

export function parseExtendedBookingRules(raw: unknown): ExtendedBookingRules {
  if (!raw || typeof raw !== 'object') return {};
  const o = raw as Record<string, unknown>;
  const out: ExtendedBookingRules = {};

  if (typeof o.cancellation_notice_hours === 'number' && Number.isFinite(o.cancellation_notice_hours)) {
    out.cancellation_notice_hours = o.cancellation_notice_hours;
  }

  return out;
}

/**
 * Cancellation notice hours for refunds: global `booking_rules.cancellation_notice_hours` → default.
 */
export function getCancellationNoticeHoursForBooking(
  rules: ExtendedBookingRules,
  _model: BookingModel,
  defaultHours: number,
): number {
  if (typeof rules.cancellation_notice_hours === 'number' && Number.isFinite(rules.cancellation_notice_hours)) {
    return rules.cancellation_notice_hours;
  }
  return defaultHours;
}

/**
 * Reminder lead times for scheduled comms: `notification_settings` only (communications tab).
 */
/** Row shape matches bookings passed to scheduled comms (FKs for model inference — timings are not per model). */
type BookingRowForReminder = {
  experience_event_id?: string | null;
  class_instance_id?: string | null;
  resource_id?: string | null;
  event_session_id?: string | null;
  calendar_id?: string | null;
  service_item_id?: string | null;
  practitioner_id?: string | null;
  appointment_service_id?: string | null;
};

export function getReminderHoursForBookingRow(
  ns: VenueNotificationSettings,
  _rules: ExtendedBookingRules,
  _row: BookingRowForReminder,
): { reminder_1_hours_before: number; reminder_2_hours_before: number } {
  return {
    reminder_1_hours_before: ns.reminder_1_hours_before,
    reminder_2_hours_before: ns.reminder_2_hours_before,
  };
}
