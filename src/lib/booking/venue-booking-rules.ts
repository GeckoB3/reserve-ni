/**
 * Extended `venues.booking_rules` JSON (read path). Sprint 1.5: per-model cancellation and reminder offsets.
 * Settings UI may add these keys later; cron and create use fallbacks when absent.
 */

import type { BookingModel } from '@/types/booking-models';
import type { VenueNotificationSettings } from '@/lib/notifications/notification-settings';
import { inferBookingRowModel } from '@/lib/booking/infer-booking-row-model';

const MODEL_KEYS: BookingModel[] = [
  'table_reservation',
  'practitioner_appointment',
  'unified_scheduling',
  'event_ticket',
  'class_session',
  'resource_booking',
];

export interface ReminderOffsetByModel {
  reminder_1?: number;
  reminder_2?: number;
}

export interface ExtendedBookingRules {
  cancellation_notice_hours?: number;
  /** Per-model cancellation window (hours). Overrides global `cancellation_notice_hours` when set. */
  cancellation_notice_hours_by_model?: Partial<Record<BookingModel, number>>;
  /** Per-model reminder lead times (hours). Merged with `notification_settings` defaults. */
  reminder_hours_before_by_model?: Partial<Record<BookingModel, ReminderOffsetByModel>>;
}

export function parseExtendedBookingRules(raw: unknown): ExtendedBookingRules {
  if (!raw || typeof raw !== 'object') return {};
  const o = raw as Record<string, unknown>;
  const out: ExtendedBookingRules = {};

  if (typeof o.cancellation_notice_hours === 'number' && Number.isFinite(o.cancellation_notice_hours)) {
    out.cancellation_notice_hours = o.cancellation_notice_hours;
  }

  const byC = o.cancellation_notice_hours_by_model;
  if (byC && typeof byC === 'object') {
    const m: Partial<Record<BookingModel, number>> = {};
    for (const k of MODEL_KEYS) {
      const v = (byC as Record<string, unknown>)[k];
      if (typeof v === 'number' && Number.isFinite(v)) m[k] = v;
    }
    if (Object.keys(m).length > 0) out.cancellation_notice_hours_by_model = m;
  }

  const byR = o.reminder_hours_before_by_model;
  if (byR && typeof byR === 'object') {
    const m: Partial<Record<BookingModel, ReminderOffsetByModel>> = {};
    for (const k of MODEL_KEYS) {
      const entry = (byR as Record<string, unknown>)[k];
      if (!entry || typeof entry !== 'object') continue;
      const e = entry as Record<string, unknown>;
      const r1 = e.reminder_1;
      const r2 = e.reminder_2;
      const row: ReminderOffsetByModel = {};
      if (typeof r1 === 'number' && Number.isFinite(r1)) row.reminder_1 = r1;
      if (typeof r2 === 'number' && Number.isFinite(r2)) row.reminder_2 = r2;
      if (row.reminder_1 != null || row.reminder_2 != null) m[k] = row;
    }
    if (Object.keys(m).length > 0) out.reminder_hours_before_by_model = m;
  }

  return out;
}

/**
 * Cancellation notice hours for a booking row: per-model override → global → default.
 */
export function getCancellationNoticeHoursForBooking(
  rules: ExtendedBookingRules,
  model: BookingModel,
  defaultHours: number,
): number {
  const byModel = rules.cancellation_notice_hours_by_model?.[model];
  if (typeof byModel === 'number' && Number.isFinite(byModel)) return byModel;
  if (typeof rules.cancellation_notice_hours === 'number' && Number.isFinite(rules.cancellation_notice_hours)) {
    return rules.cancellation_notice_hours;
  }
  return defaultHours;
}

/**
 * Effective reminder lead times for scheduled comms (unified + C/D/E secondary), merged with `notification_settings`.
 */
export function getReminderHoursForBookingRow(
  ns: VenueNotificationSettings,
  rules: ExtendedBookingRules,
  row: Parameters<typeof inferBookingRowModel>[0],
): { reminder_1_hours_before: number; reminder_2_hours_before: number } {
  const model = inferBookingRowModel(row);
  const o = rules.reminder_hours_before_by_model?.[model];
  return {
    reminder_1_hours_before:
      typeof o?.reminder_1 === 'number' && Number.isFinite(o.reminder_1) ? o.reminder_1 : ns.reminder_1_hours_before,
    reminder_2_hours_before:
      typeof o?.reminder_2 === 'number' && Number.isFinite(o.reminder_2) ? o.reminder_2 : ns.reminder_2_hours_before,
  };
}
