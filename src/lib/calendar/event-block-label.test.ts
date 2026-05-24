import { describe, expect, it } from 'vitest';
import { formatEventUptakeLine } from './event-block-label';
import type { ScheduleBlockDTO } from '@/types/schedule-blocks';

function eventBlock(overrides: Partial<ScheduleBlockDTO> = {}): ScheduleBlockDTO {
  return {
    id: 'ev-1',
    kind: 'event_ticket',
    date: '2026-06-01',
    start_time: '19:00',
    end_time: '22:00',
    title: 'Wine tasting',
    ...overrides,
  };
}

describe('formatEventUptakeLine', () => {
  it('includes arrived count when bookings exist', () => {
    expect(
      formatEventUptakeLine(
        eventBlock({
          event_capacity: 20,
          event_booking_count: 8,
          event_party_total: 12,
          event_arrived_count: 3,
        }),
      ),
    ).toBe('12/20 spots · 8 bookings · 3 arrived');
  });

  it('shows zero arrived when none marked yet', () => {
    expect(
      formatEventUptakeLine(
        eventBlock({
          event_booking_count: 2,
          event_party_total: 4,
          event_arrived_count: 0,
        }),
      ),
    ).toBe('2 bookings · 4 guests · 0 arrived');
  });
});
