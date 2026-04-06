import { describe, it, expect } from 'vitest';
import { isCdeBookingRow } from '@/lib/booking/cde-booking';

/**
 * Scheduled comms split (send-communications cron):
 * - Legacy 56h / day-of / post_visit: skip rows where isCdeBookingRow (see route.ts).
 * - runUnifiedSchedulingComms: Model B venues only; loops skip isCdeBookingRow.
 * - runSecondaryModelScheduledComms: all venues; queries .or(CDE_OR_FILTER) + isCdeBookingRow.
 *
 * Dedup: communication_logs UNIQUE(booking_id, message_type) + logToCommLogs insert-on-conflict
 * prevents duplicate reminder_1_email / reminder_2_email / reminder_2_sms / post_visit for the same booking.
 *
 * Manual verification matrix (staging):
 * 1. table_reservation + enabled event_ticket: create event booking → expect cde_reminder_1 in cron JSON after window.
 * 2. unified_scheduling + enabled event_ticket: create ticket booking → same; pure appointment → unified_reminder_* only.
 */

describe('isCdeBookingRow (cron path split)', () => {
  it('returns false for appointment/table-like rows without C/D/E FKs', () => {
    expect(isCdeBookingRow({})).toBe(false);
    expect(isCdeBookingRow({ experience_event_id: null, class_instance_id: null, resource_id: null })).toBe(
      false,
    );
  });

  it('returns true when any C/D/E FK is set', () => {
    expect(isCdeBookingRow({ experience_event_id: '550e8400-e29b-41d4-a716-446655440000' })).toBe(true);
    expect(isCdeBookingRow({ class_instance_id: '550e8400-e29b-41d4-a716-446655440001' })).toBe(true);
    expect(isCdeBookingRow({ resource_id: '550e8400-e29b-41d4-a716-446655440002' })).toBe(true);
  });
});
