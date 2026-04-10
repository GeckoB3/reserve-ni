import { describe, it, expect } from 'vitest';
import { isWeeklyScheduleClosedForDate } from '@/lib/availability/venue-wide-business-hours';
import type { AvailabilityBlock, OpeningHours } from '@/types/availability';

describe('isWeeklyScheduleClosedForDate', () => {
  /** 2026-04-18 is a Saturday */
  const saturday = '2026-04-18';

  it('returns true when weekly hours omit Saturday and there are no blocks', () => {
    const openingHours: OpeningHours = {
      '0': { periods: [{ open: '09:00', close: '17:00' }] },
      '1': { periods: [{ open: '09:00', close: '17:00' }] },
      '2': { periods: [{ open: '09:00', close: '17:00' }] },
      '3': { periods: [{ open: '09:00', close: '17:00' }] },
      '4': { periods: [{ open: '09:00', close: '17:00' }] },
      '5': { periods: [{ open: '09:00', close: '17:00' }] },
    };
    expect(isWeeklyScheduleClosedForDate(openingHours, saturday, [])).toBe(true);
  });

  it('returns false when a venue-wide block exists on that date', () => {
    const openingHours: OpeningHours = {
      '1': { periods: [{ open: '09:00', close: '17:00' }] },
    };
    const blocks: AvailabilityBlock[] = [
      {
        id: '1',
        venue_id: 'v',
        service_id: null,
        block_type: 'closed',
        date_start: saturday,
        date_end: saturday,
        time_start: null,
        time_end: null,
        override_max_covers: null,
        reason: null,
        yield_overrides: null,
        override_periods: null,
      },
    ];
    expect(isWeeklyScheduleClosedForDate(openingHours, saturday, blocks)).toBe(false);
  });
});
