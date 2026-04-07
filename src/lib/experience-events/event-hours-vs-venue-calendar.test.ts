import { describe, expect, it } from 'vitest';
import {
  calendarSegmentsForDate,
  validateExperienceEventWindowAgainstVenueAndCalendar,
} from '@/lib/experience-events/event-hours-vs-venue-calendar';
import type { OpeningHours } from '@/types/availability';

function baseCalendar(working: Record<string, Array<{ start: string; end: string }>>): Record<string, unknown> {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    venue_id: 'v1',
    name: 'Test',
    working_hours: working,
    break_times: [] as Array<{ start: string; end: string }>,
    break_times_by_day: null,
    days_off: [] as string[],
    is_active: true,
    sort_order: 0,
    parallel_clients: 1,
    staff_id: null,
    created_at: new Date().toISOString(),
    slug: null,
  };
}

describe('validateExperienceEventWindowAgainstVenueAndCalendar', () => {
  it('allows event inside calendar and venue when venue configured', () => {
    const openingHours: OpeningHours = {
      '1': { periods: [{ open: '09:00', close: '22:00' }] },
      '2': { periods: [{ open: '09:00', close: '22:00' }] },
      '3': { periods: [{ open: '09:00', close: '22:00' }] },
      '4': { periods: [{ open: '09:00', close: '22:00' }] },
      '5': { periods: [{ open: '09:00', close: '22:00' }] },
      '6': { periods: [{ open: '09:00', close: '22:00' }] },
      '0': { periods: [{ open: '09:00', close: '22:00' }] },
    };
    const uc = baseCalendar({
      '1': [{ start: '10:00', end: '18:00' }],
    });
    const err = validateExperienceEventWindowAgainstVenueAndCalendar(
      '2026-04-06',
      '12:00',
      '14:00',
      { opening_hours: openingHours, venue_opening_exceptions: [] },
      uc,
    );
    expect(err).toBeNull();
  });

  it('rejects when venue closed on date (exception)', () => {
    const uc = baseCalendar({
      '1': [{ start: '10:00', end: '18:00' }],
    });
    const err = validateExperienceEventWindowAgainstVenueAndCalendar(
      '2026-04-06',
      '12:00',
      '14:00',
      {
        opening_hours: {},
        venue_opening_exceptions: [
          {
            id: 'x',
            date_start: '2026-04-06',
            date_end: '2026-04-06',
            closed: true,
            periods: undefined,
            reason: null,
          },
        ],
      },
      uc,
    );
    expect(err).toContain('closed');
  });

  it('rejects when event overlaps a break on the calendar', () => {
    const uc: Record<string, unknown> = {
      ...baseCalendar({
        '1': [{ start: '09:00', end: '17:00' }],
      }),
      break_times: [{ start: '12:00', end: '13:00' }],
    };
    const err = validateExperienceEventWindowAgainstVenueAndCalendar(
      '2026-04-06',
      '11:30',
      '13:30',
      { opening_hours: null, venue_opening_exceptions: [] },
      uc,
    );
    expect(err).not.toBeNull();
  });

  it('rejects when calendar has no hours that day', () => {
    const uc = baseCalendar({
      '2': [{ start: '10:00', end: '18:00' }],
    });
    const err = validateExperienceEventWindowAgainstVenueAndCalendar(
      '2026-04-06',
      '12:00',
      '14:00',
      { opening_hours: null, venue_opening_exceptions: [] },
      uc,
    );
    expect(err ?? '').toContain('no working hours');
  });
});

describe('calendarSegmentsForDate', () => {
  it('subtracts breaks from working', () => {
    const uc: Record<string, unknown> = {
      ...baseCalendar({
        '1': [{ start: '09:00', end: '17:00' }],
      }),
      break_times: [{ start: '12:00', end: '13:00' }],
    };
    const segs = calendarSegmentsForDate(uc, '2026-04-06');
    expect(segs).toEqual([
      { start: 9 * 60, end: 12 * 60 },
      { start: 13 * 60, end: 17 * 60 },
    ]);
  });
});
