import { describe, it, expect } from 'vitest';
import { canMarkNoShowForSlot } from './booking-status';

describe('canMarkNoShowForSlot', () => {
  const tz = 'Europe/London';

  it('allows no-show after grace when server clock is UTC but appointment is venue-local (BST)', () => {
    const bookingDate = '2026-05-20';
    const bookingTime = '14:00';
    const graceMinutes = 15;
    // 14:20 Europe/London (BST) = 13:20 UTC — old UTC getHours() logic incorrectly blocked this.
    const now = new Date('2026-05-20T13:20:00.000Z');

    expect(canMarkNoShowForSlot(bookingDate, bookingTime, graceMinutes, tz, now)).toBe(true);
  });

  it('blocks no-show before grace elapses in venue timezone', () => {
    const bookingDate = '2026-05-20';
    const bookingTime = '14:00';
    const graceMinutes = 15;
    const now = new Date('2026-05-20T13:10:00.000Z'); // 14:10 London

    expect(canMarkNoShowForSlot(bookingDate, bookingTime, graceMinutes, tz, now)).toBe(false);
  });

  it('allows no-show on past booking dates', () => {
    const now = new Date('2026-05-21T10:00:00.000Z');
    expect(canMarkNoShowForSlot('2026-05-20', '18:00', 15, tz, now)).toBe(true);
  });

  it('blocks no-show on future booking dates', () => {
    const now = new Date('2026-05-20T10:00:00.000Z');
    expect(canMarkNoShowForSlot('2026-05-21', '12:00', 15, tz, now)).toBe(false);
  });
});
