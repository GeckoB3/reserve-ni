import { describe, expect, it } from 'vitest';
import {
  cancelledBookingFromFreedSlot,
  freedSlotFromCancelledBooking,
  slotTimeForDb,
  slotTimeHm,
} from '@/lib/booking/waitlist-freed-slot';

describe('waitlist-freed-slot', () => {
  it('normalises slot times', () => {
    expect(slotTimeHm('14:30:00')).toBe('14:30');
    expect(slotTimeForDb('14:30')).toBe('14:30:00');
  });

  it('round-trips cancelled booking to freed slot context', () => {
    const booking = {
      id: 'b1',
      venue_id: 'v1',
      booking_date: '2026-06-15',
      booking_time: '14:30:00',
      practitioner_id: 'prac-1',
      calendar_id: 'cal-1',
      appointment_service_id: null,
      service_item_id: 'svc-1',
    };
    const slot = freedSlotFromCancelledBooking(booking);
    expect(slot.calendarId).toBe('cal-1');
    expect(slot.serviceItemId).toBe('svc-1');

    const synthetic = cancelledBookingFromFreedSlot(slot);
    expect(synthetic.booking_date).toBe('2026-06-15');
    expect(synthetic.booking_time).toBe('14:30:00');
    expect(synthetic.calendar_id).toBe('cal-1');
  });
});
