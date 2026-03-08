import { describe, it, expect } from 'vitest';
import {
  getAvailableSlots,
  getAvailableCoversForSlotWithTurnTime,
  timeToMinutes,
  minutesToTime,
  getDayOfWeek,
  isDateBlocked,
  isSlotBlocked,
} from './index';
import type {
  AvailabilityConfig,
  VenueForAvailability,
  BookingForAvailability,
  FixedIntervalsConfig,
  NamedSittingsConfig,
} from '@/types/availability';

const openingHours5to10: VenueForAvailability['opening_hours'] = {
  '0': { open: '17:00', close: '22:00' },
  '1': { open: '17:00', close: '22:00' },
  '2': { open: '17:00', close: '22:00' },
  '3': { open: '17:00', close: '22:00' },
  '4': { open: '17:00', close: '22:00' },
  '5': { open: '17:00', close: '22:00' },
  '6': { open: '17:00', close: '22:00' },
};

function venueFixed(
  overrides: Partial<{ opening_hours: VenueForAvailability['opening_hours']; availability_config: AvailabilityConfig }> = {}
): VenueForAvailability {
  return {
    id: 'v1',
    opening_hours: overrides.opening_hours ?? openingHours5to10,
    availability_config: overrides.availability_config ?? {
      model: 'fixed_intervals',
      interval_minutes: 30,
      max_covers_by_day: { '0': 20, '1': 20, '2': 20, '3': 20, '4': 20, '5': 30, '6': 30 },
    },
    timezone: 'Europe/London',
  };
}

function venueFixedWithTurnTime(durationMin = 90): VenueForAvailability {
  return venueFixed({
    availability_config: {
      model: 'fixed_intervals',
      interval_minutes: 30,
      max_covers_by_day: { '0': 20, '1': 20, '2': 20, '3': 20, '4': 20, '5': 30, '6': 30 },
      turn_time_enabled: true,
      sitting_duration_minutes: durationMin,
    },
  });
}

function venueNamed(): VenueForAvailability {
  return {
    id: 'v1',
    opening_hours: null,
    availability_config: {
      model: 'named_sittings',
      sittings: [
        { id: 'early', name: 'Early Bird', start_time: '17:00', end_time: '18:45', max_covers: 40 },
        { id: 'main', name: 'Main', start_time: '19:00', end_time: '21:30', max_covers: 50 },
      ],
    },
    timezone: 'Europe/London',
  };
}

function booking(
  time: string,
  partySize: number,
  status: 'Confirmed' | 'Pending' | 'Cancelled' = 'Confirmed'
): BookingForAvailability {
  return {
    id: `b-${time}-${partySize}`,
    booking_date: '2026-03-07',
    booking_time: time,
    party_size: partySize,
    status,
  };
}

describe('timeToMinutes / minutesToTime', () => {
  it('parses HH:mm to minutes', () => {
    expect(timeToMinutes('17:00')).toBe(17 * 60);
    expect(timeToMinutes('19:30')).toBe(19 * 60 + 30);
  });
  it('parses HH:mm:ss', () => {
    expect(timeToMinutes('19:00:00')).toBe(19 * 60);
  });
  it('round-trips', () => {
    expect(minutesToTime(19 * 60 + 30)).toBe('19:30');
  });
});

describe('getDayOfWeek', () => {
  it('returns 0 for Sunday', () => {
    expect(getDayOfWeek('2026-03-08')).toBe(0); // Sunday
  });
  it('returns 6 for Saturday', () => {
    expect(getDayOfWeek('2026-03-07')).toBe(6); // Saturday
  });
});

describe('isDateBlocked / isSlotBlocked', () => {
  it('returns false when no config', () => {
    expect(isDateBlocked('2026-03-07', null)).toBe(false);
  });
  it('returns true when date in blocked_dates', () => {
    expect(
      isDateBlocked('2026-03-07', {
        model: 'fixed_intervals',
        interval_minutes: 30,
        blocked_dates: ['2026-03-07'],
      })
    ).toBe(true);
  });
  it('returns true when slot overlaps blocked_slots', () => {
    const config = {
      model: 'fixed_intervals' as const,
      interval_minutes: 30 as const,
      blocked_slots: [{ date: '2026-03-07', start_time: '18:00', end_time: '19:00' }],
    };
    expect(isSlotBlocked('2026-03-07', '17:30', '18:00', config)).toBe(false);
    expect(isSlotBlocked('2026-03-07', '18:00', '18:30', config)).toBe(true);
    expect(isSlotBlocked('2026-03-07', '18:30', '19:00', config)).toBe(true);
  });
});

describe('getAvailableSlots — fixed intervals, no turn time', () => {
  const date = '2026-03-07'; // Saturday: 30 covers per slot

  it('returns slots with full capacity when no bookings', () => {
    const slots = getAvailableSlots(venueFixed(), date, []);
    expect(slots.length).toBeGreaterThan(0);
    const first = slots[0];
    expect(first?.available_covers).toBe(30);
    expect(first?.key).toBe(first?.start_time);
  });

  it('reduces available covers when booking exists', () => {
    const slots = getAvailableSlots(venueFixed(), date, [booking('19:00', 8)]);
    const slot19 = slots.find((s) => s.start_time === '19:00');
    expect(slot19?.available_covers).toBe(30 - 8);
  });

  it('fully booked slot has 0 available', () => {
    const slots = getAvailableSlots(venueFixed(), date, [booking('19:00', 30)]);
    const slot19 = slots.find((s) => s.start_time === '19:00');
    expect(slot19?.available_covers).toBe(0);
  });

  it('Pending bookings consume capacity', () => {
    const slots = getAvailableSlots(venueFixed(), date, [booking('19:00', 10, 'Pending')]);
    const slot19 = slots.find((s) => s.start_time === '19:00');
    expect(slot19?.available_covers).toBe(20);
  });

  it('Cancelled bookings do not consume capacity', () => {
    const slots = getAvailableSlots(venueFixed(), date, [booking('19:00', 30, 'Cancelled')]);
    const slot19 = slots.find((s) => s.start_time === '19:00');
    expect(slot19?.available_covers).toBe(30);
  });

  it('blocked date returns empty', () => {
    const venue = venueFixed({
      availability_config: {
        ...(venueFixed().availability_config as FixedIntervalsConfig),
        blocked_dates: [date],
      } as AvailabilityConfig,
    });
    const slots = getAvailableSlots(venue, date, []);
    expect(slots).toHaveLength(0);
  });

  it('blocked slot is excluded', () => {
    const venue = venueFixed({
      availability_config: {
        ...(venueFixed().availability_config as FixedIntervalsConfig),
        blocked_slots: [{ date, start_time: '19:00', end_time: '19:30' }],
      } as AvailabilityConfig,
    });
    const slots = getAvailableSlots(venue, date, []);
    const slot19 = slots.find((s) => s.start_time === '19:00');
    expect(slot19).toBeUndefined();
  });

  it('day with no opening hours returns empty', () => {
    const venue = venueFixed({ opening_hours: {} });
    const slots = getAvailableSlots(venue, date, []);
    expect(slots).toHaveLength(0);
  });
});

describe('getAvailableSlots — fixed intervals with turn time', () => {
  const date = '2026-03-07';

  it('available = min across spanned slots (90 min)', () => {
    const venue = venueFixedWithTurnTime(90);
    const slots = getAvailableSlots(venue, date, [
      booking('19:00', 25), // 19:00 slot: 5 left; 19:30 and 20:00: 30 each
    ]);
    const slot19 = slots.find((s) => s.start_time === '19:00');
    expect(slot19?.available_covers).toBe(5);
  });

  it('booking at 19:00 spans 19:00, 19:30, 20:00 with 90 min; min available is 2', () => {
    const venue = venueFixedWithTurnTime(90);
    // Only 20:00 has 28 booked → 2 left. Slot 19:00 spans 19:00, 19:30, 20:00 → min(30, 30, 2) = 2.
    const slots = getAvailableSlots(venue, date, [booking('20:00', 28)]);
    const slot19 = slots.find((s) => s.start_time === '19:00');
    expect(slot19?.available_covers).toBe(2);
  });

  it('last slot of day: turn time only spans available slots', () => {
    const venue = venueFixedWithTurnTime(90);
    const slots = getAvailableSlots(venue, date, []);
    const lastSlot = slots[slots.length - 1];
    expect(lastSlot).toBeDefined();
    const lastStart = timeToMinutes(lastSlot!.start_time);
    const close = timeToMinutes('22:00');
    expect(lastStart + 90).toBeGreaterThan(close);
    expect(lastSlot!.available_covers).toBe(30);
  });

  it('fully booked in one spanned slot gives 0', () => {
    const venue = venueFixedWithTurnTime(90);
    const slots = getAvailableSlots(venue, date, [booking('20:00', 30)]);
    const slot19 = slots.find((s) => s.start_time === '19:30');
    expect(slot19?.available_covers).toBe(0);
  });
});

describe('getAvailableSlots — named sittings', () => {
  const date = '2026-03-07';

  it('returns sittings with full capacity when no bookings', () => {
    const slots = getAvailableSlots(venueNamed(), date, []);
    expect(slots).toHaveLength(2);
    expect(slots[0]?.label).toBe('Early Bird');
    expect(slots[0]?.available_covers).toBe(40);
    expect(slots[1]?.label).toBe('Main');
    expect(slots[1]?.available_covers).toBe(50);
  });

  it('booking in sitting reduces that sitting capacity', () => {
    const slots = getAvailableSlots(venueNamed(), date, [
      booking('17:30', 15),
      booking('19:00', 20),
    ]);
    const early = slots.find((s) => s.sitting_id === 'early');
    const main = slots.find((s) => s.sitting_id === 'main');
    expect(early?.available_covers).toBe(40 - 15);
    expect(main?.available_covers).toBe(50 - 20);
  });

  it('fully booked sitting has 0', () => {
    const slots = getAvailableSlots(venueNamed(), date, [booking('17:00', 40)]);
    const early = slots.find((s) => s.sitting_id === 'early');
    expect(early?.available_covers).toBe(0);
  });

  it('Pending consumes capacity', () => {
    const slots = getAvailableSlots(venueNamed(), date, [booking('19:00', 50, 'Pending')]);
    const main = slots.find((s) => s.sitting_id === 'main');
    expect(main?.available_covers).toBe(0);
  });

  it('blocked date returns empty', () => {
    const venue: VenueForAvailability = {
      ...venueNamed(),
      availability_config: {
        ...(venueNamed().availability_config as NamedSittingsConfig),
        blocked_dates: [date],
      },
    };
    const slots = getAvailableSlots(venue, date, []);
    expect(slots).toHaveLength(0);
  });
});

describe('getAvailableCoversForSlotWithTurnTime', () => {
  const date = '2026-03-07';

  it('returns min available across spanned slots', () => {
    const venue = venueFixedWithTurnTime(90);
    const bookings = [booking('19:00', 25)];
    expect(getAvailableCoversForSlotWithTurnTime(venue, date, bookings, '19:00')).toBe(5);
  });

  it('returns 0 when slot is blocked', () => {
    const venue = venueFixed({
      availability_config: {
        model: 'fixed_intervals',
        interval_minutes: 30,
        max_covers_by_day: { '6': 30 },
        turn_time_enabled: true,
        sitting_duration_minutes: 90,
        blocked_slots: [{ date, start_time: '19:00', end_time: '19:30' }],
      } as AvailabilityConfig,
    });
    expect(getAvailableCoversForSlotWithTurnTime(venue, date, [], '19:00')).toBe(0);
  });
});

describe('edge cases', () => {
  it('no config returns empty', () => {
    const venue = venueFixed();
    (venue as VenueForAvailability).availability_config = null;
    expect(getAvailableSlots(venue, '2026-03-07', [])).toHaveLength(0);
  });

  it('multiple bookings in same slot sum correctly', () => {
    const date = '2026-03-07';
    const slots = getAvailableSlots(venueFixed(), date, [
      booking('19:00', 10),
      booking('19:00', 12),
    ]);
    const slot19 = slots.find((s) => s.start_time === '19:00');
    expect(slot19?.available_covers).toBe(30 - 22);
  });

  it('day-of-week varying capacity: Sunday uses max_covers for 0', () => {
    const date = '2026-03-08'; // Sunday
    const venue = venueFixed();
    const slots = getAvailableSlots(venue, date, []);
    expect(slots.length).toBeGreaterThan(0);
    expect(slots[0]?.available_covers).toBe(20);
  });
});
