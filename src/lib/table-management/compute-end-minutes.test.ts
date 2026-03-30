import { describe, expect, it } from 'vitest';
import { computeEndMinutes } from '@/lib/table-management/lifecycle';

describe('computeEndMinutes', () => {
  it('extends past midnight when wall end time is before start time', () => {
    const end = computeEndMinutes({
      booking_time: '23:00:00',
      estimated_end_time: '1970-01-01T01:00:00.000Z', // time part 01:00
    });
    expect(end).toBe(25 * 60);
  });

  it('uses fallback when estimated end is missing', () => {
    const end = computeEndMinutes({
      booking_time: '12:00:00',
      estimated_end_time: null,
    });
    expect(end).toBe(12 * 60 + 90);
  });

  it('does not add a day when end is after start same calendar wall day', () => {
    const end = computeEndMinutes({
      booking_time: '12:00:00',
      estimated_end_time: '2026-03-28T14:30:00.000Z',
    });
    expect(end).toBe(14 * 60 + 30);
  });
});
