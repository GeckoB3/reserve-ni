import { describe, expect, it } from 'vitest';
import { bookingRowEndMinutes, unionMinuteRanges } from '@/lib/availability/calendar-resource-occupancy';

describe('unionMinuteRanges', () => {
  it('merges overlapping ranges', () => {
    expect(
      unionMinuteRanges([
        { start: 540, end: 600 },
        { start: 580, end: 660 },
      ]),
    ).toEqual([{ start: 540, end: 660 }]);
  });

  it('keeps disjoint ranges', () => {
    expect(
      unionMinuteRanges([
        { start: 540, end: 600 },
        { start: 700, end: 720 },
      ]),
    ).toEqual([
      { start: 540, end: 600 },
      { start: 700, end: 720 },
    ]);
  });

  it('drops invalid ranges', () => {
    expect(unionMinuteRanges([{ start: 100, end: 50 }])).toEqual([]);
  });
});

describe('bookingRowEndMinutes', () => {
  it('uses booking_end_time when present', () => {
    expect(
      bookingRowEndMinutes({
        booking_time: '09:00',
        booking_end_time: '10:30:00',
      }),
    ).toBe(10 * 60 + 30);
  });

  it('parses estimated_end_time ISO time', () => {
    expect(
      bookingRowEndMinutes({
        booking_time: '09:00',
        estimated_end_time: '2026-04-07T10:30:00.000Z',
      }),
    ).toBe(10 * 60 + 30);
  });
});
