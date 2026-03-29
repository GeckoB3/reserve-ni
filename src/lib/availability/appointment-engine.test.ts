import { describe, it, expect } from 'vitest';
import type { OpeningHours } from '@/types/availability';
import { getDayOfWeek } from '@/lib/availability/engine';
import { computeAppointmentAvailability, type AppointmentEngineInput } from './appointment-engine';

function todayYmd(): string {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
}

/** Working-hours keys match getDayOfWeek (same as practitioner dashboard). */
function workingHoursDayKey(dateStr: string): string {
  return String(getDayOfWeek(dateStr));
}

describe('computeAppointmentAvailability', () => {
  it('clips appointment slots to venue opening hours when configured (intersection with staff hours)', () => {
    const date = '2030-06-02';
    const dk = workingHoursDayKey(date);
    const venueOpeningHours = {
      [dk]: { periods: [{ open: '10:00', close: '16:00' }] },
    } as OpeningHours;
    const input: AppointmentEngineInput = {
      date,
      venueOpeningHours,
      practitioners: [
        {
          id: 'p1',
          name: 'Alex',
          is_active: true,
          working_hours: { [dk]: [{ start: '09:00', end: '17:00' }] },
          break_times: [],
          days_off: [],
        } as unknown as import('@/types/booking-models').Practitioner,
      ],
      services: [
        {
          id: 's1',
          name: 'Cut',
          duration_minutes: 30,
          buffer_minutes: 0,
          is_active: true,
        } as import('@/types/booking-models').AppointmentService,
      ],
      practitionerServices: [],
      existingBookings: [],
    };
    const r = computeAppointmentAvailability(input);
    expect(r.practitioners[0]?.slots.some((s) => s.start_time === '09:00')).toBe(false);
    expect(r.practitioners[0]?.slots.some((s) => s.start_time === '09:30')).toBe(false);
    expect(r.practitioners[0]?.slots.some((s) => s.start_time === '10:00')).toBe(true);
    expect(r.practitioners[0]?.slots.some((s) => s.start_time === '15:30')).toBe(true);
    expect(r.practitioners[0]?.slots.some((s) => s.start_time === '16:00')).toBe(false);
  });

  it('applies min_notice_hours on top of current time for guest flow', () => {
    const date = todayYmd();
    const dk = workingHoursDayKey(date);
    const input: AppointmentEngineInput = {
      date,
      practitioners: [
        {
          id: 'p1',
          name: 'Alex',
          is_active: true,
          working_hours: { [dk]: [{ start: '09:00', end: '17:00' }] },
          break_times: [],
          days_off: [],
        } as unknown as import('@/types/booking-models').Practitioner,
      ],
      services: [
        {
          id: 's1',
          name: 'Cut',
          duration_minutes: 30,
          buffer_minutes: 0,
          is_active: true,
        } as import('@/types/booking-models').AppointmentService,
      ],
      practitionerServices: [],
      existingBookings: [],
      minNoticeHours: 2,
    };
    const r = computeAppointmentAvailability(input, 10 * 60);
    expect(r.practitioners[0]?.slots.find((s) => s.start_time === '10:00')).toBeUndefined();
    expect(r.practitioners[0]?.slots.find((s) => s.start_time === '11:30')).toBeUndefined();
    expect(r.practitioners[0]?.slots.find((s) => s.start_time === '12:00')).toBeDefined();
  });

  it('returns no slots for venue-local today when allowSameDayBooking is false', () => {
    const date = todayYmd();
    const dk = workingHoursDayKey(date);
    const input: AppointmentEngineInput = {
      date,
      practitioners: [
        {
          id: 'p1',
          name: 'Alex',
          is_active: true,
          working_hours: { [dk]: [{ start: '09:00', end: '17:00' }] },
          break_times: [],
          days_off: [],
        } as unknown as import('@/types/booking-models').Practitioner,
      ],
      services: [
        {
          id: 's1',
          name: 'Cut',
          duration_minutes: 30,
          buffer_minutes: 0,
          is_active: true,
        } as import('@/types/booking-models').AppointmentService,
      ],
      practitionerServices: [],
      existingBookings: [],
      allowSameDayBooking: false,
    };
    const r = computeAppointmentAvailability(input, 9 * 60);
    expect(r.practitioners[0]?.slots.length ?? 0).toBe(0);
  });

  it('hides today slots before current time for guest flow (default)', () => {
    const date = todayYmd();
    const dk = workingHoursDayKey(date);
    const input: AppointmentEngineInput = {
      date,
      practitioners: [
        {
          id: 'p1',
          name: 'Alex',
          is_active: true,
          working_hours: { [dk]: [{ start: '09:00', end: '17:00' }] },
          break_times: [],
          days_off: [],
        } as unknown as import('@/types/booking-models').Practitioner,
      ],
      services: [
        {
          id: 's1',
          name: 'Cut',
          duration_minutes: 30,
          buffer_minutes: 0,
          is_active: true,
        } as import('@/types/booking-models').AppointmentService,
      ],
      practitionerServices: [],
      existingBookings: [],
    };
    // Simulate 6pm local: 16:30 is "past"
    const lateDay = 18 * 60;
    const r = computeAppointmentAvailability(input, lateDay);
    const slot1630 = r.practitioners[0]?.slots.find((s) => s.start_time === '16:30');
    expect(slot1630).toBeUndefined();
  });

  it('skipPastSlotFilter allows same-day reschedule to a clock-past time for staff validation', () => {
    const date = todayYmd();
    const dk = workingHoursDayKey(date);
    const input: AppointmentEngineInput = {
      date,
      practitioners: [
        {
          id: 'p1',
          name: 'Alex',
          is_active: true,
          working_hours: { [dk]: [{ start: '09:00', end: '17:00' }] },
          break_times: [],
          days_off: [],
        } as unknown as import('@/types/booking-models').Practitioner,
      ],
      services: [
        {
          id: 's1',
          name: 'Cut',
          duration_minutes: 30,
          buffer_minutes: 0,
          is_active: true,
        } as import('@/types/booking-models').AppointmentService,
      ],
      practitionerServices: [],
      existingBookings: [],
      skipPastSlotFilter: true,
    };
    const lateDay = 18 * 60;
    const r = computeAppointmentAvailability(input, lateDay);
    const slot1630 = r.practitioners[0]?.slots.find((s) => s.start_time === '16:30' && s.service_id === 's1');
    expect(slot1630).toBeDefined();
  });

  it('respects practitioner calendar blocks', () => {
    const date = '2030-06-02';
    const dk = workingHoursDayKey(date);
    const input: AppointmentEngineInput = {
      date,
      practitioners: [
        {
          id: 'p1',
          name: 'Alex',
          is_active: true,
          working_hours: { [dk]: [{ start: '09:00', end: '17:00' }] },
          break_times: [],
          days_off: [],
        } as unknown as import('@/types/booking-models').Practitioner,
      ],
      services: [
        {
          id: 's1',
          name: 'Cut',
          duration_minutes: 30,
          buffer_minutes: 0,
          is_active: true,
        } as import('@/types/booking-models').AppointmentService,
      ],
      practitionerServices: [],
      existingBookings: [],
      practitionerBlockedRanges: [{ practitioner_id: 'p1', start: 15 * 60, end: 17 * 60 }],
    };
    const r = computeAppointmentAvailability(input);
    const inBlock = r.practitioners[0]?.slots.some((s) => s.start_time === '15:30');
    expect(inBlock).toBe(false);
    // 14:30 + 30m ends at 15:00 (block start) — must not overlap closed interval
    const beforeBlock = r.practitioners[0]?.slots.some((s) => s.start_time === '14:30');
    expect(beforeBlock).toBe(true);
  });

  it('after removing the booking being moved, 13:00 is available when another booking occupied 12:00', () => {
    const date = '2030-08-11';
    const dk = workingHoursDayKey(date);
    const base: AppointmentEngineInput = {
      date,
      practitioners: [
        {
          id: 'p1',
          name: 'Alex',
          is_active: true,
          working_hours: { [dk]: [{ start: '09:00', end: '17:00' }] },
          break_times: [],
          days_off: [],
        } as unknown as import('@/types/booking-models').Practitioner,
      ],
      services: [
        {
          id: 's1',
          name: 'Cut',
          duration_minutes: 30,
          buffer_minutes: 0,
          is_active: true,
        } as import('@/types/booking-models').AppointmentService,
      ],
      practitionerServices: [{ id: 'ps1', practitioner_id: 'p1', service_id: 's1', custom_duration_minutes: null, custom_price_pence: null }],
      existingBookings: [
        {
          id: 'moving',
          practitioner_id: 'p1',
          booking_time: '12:00',
          duration_minutes: 30,
          buffer_minutes: 0,
          status: 'Confirmed',
        },
      ],
    };
    const staffInput: AppointmentEngineInput = {
      ...base,
      existingBookings: base.existingBookings.filter((b) => b.id !== 'moving'),
      skipPastSlotFilter: true,
    };
    const r = computeAppointmentAvailability(staffInput);
    expect(r.practitioners[0]?.slots.some((s) => s.start_time === '13:00' && s.service_id === 's1')).toBe(true);
  });

  it('uses break_times_by_day for that weekday when set (ignores same-day break_times)', () => {
    const date = '2030-06-04';
    const dk = workingHoursDayKey(date);
    const input: AppointmentEngineInput = {
      date,
      practitioners: [
        {
          id: 'p1',
          name: 'Alex',
          is_active: true,
          working_hours: { [dk]: [{ start: '09:00', end: '17:00' }] },
          break_times: [{ start: '12:00', end: '13:00' }],
          break_times_by_day: { [dk]: [] },
          days_off: [],
        } as unknown as import('@/types/booking-models').Practitioner,
      ],
      services: [
        {
          id: 's1',
          name: 'Cut',
          duration_minutes: 30,
          buffer_minutes: 0,
          is_active: true,
        } as import('@/types/booking-models').AppointmentService,
      ],
      practitionerServices: [],
      existingBookings: [],
    };
    const r = computeAppointmentAvailability(input);
    const slot1200 = r.practitioners[0]?.slots.find((s) => s.start_time === '12:00' && s.service_id === 's1');
    expect(slot1200).toBeDefined();
  });
});
