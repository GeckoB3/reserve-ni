import { describe, it, expect } from 'vitest';
import { getDayOfWeekForYmdInTimezone } from '@/lib/venue/venue-local-clock';
import { computeAppointmentAvailability, type AppointmentEngineInput } from '@/lib/availability/appointment-engine';

describe('getDayOfWeekForYmdInTimezone', () => {
  it('returns Wednesday for 2026-04-01 in Europe/London', () => {
    expect(getDayOfWeekForYmdInTimezone('2026-04-01', 'Europe/London')).toBe(3);
  });
});

describe('computeAppointmentAvailability (unified / processing)', () => {
  it('treats processing_time_minutes as part of slot footprint for conflicts', () => {
    const basePractitioner = {
      id: 'p1',
      venue_id: 'v1',
      staff_id: null,
      name: 'Alex',
      email: null,
      phone: null,
      working_hours: { '3': [{ start: '09:00', end: '12:00' }] },
      break_times: [] as { start: string; end: string }[],
      days_off: [] as string[],
      is_active: true,
      sort_order: 0,
      created_at: '2026-01-01T00:00:00Z',
    };

    const input: AppointmentEngineInput = {
      date: '2026-04-01',
      practitioners: [basePractitioner],
      services: [
        {
          id: 'svc1',
          venue_id: 'v1',
          name: 'Cut',
          description: null,
          duration_minutes: 30,
          buffer_minutes: 0,
          processing_time_minutes: 30,
          price_pence: null,
          deposit_pence: null,
          colour: '#000',
          is_active: true,
          sort_order: 0,
          created_at: '2026-01-01T00:00:00Z',
        },
      ],
      practitionerServices: [
        {
          id: 'lnk1',
          practitioner_id: 'p1',
          service_id: 'svc1',
          custom_duration_minutes: null,
          custom_price_pence: null,
        },
      ],
      existingBookings: [
        {
          id: 'b1',
          practitioner_id: 'p1',
          booking_time: '09:00',
          duration_minutes: 30,
          buffer_minutes: 0,
          processing_time_minutes: 30,
          status: 'Confirmed',
        },
      ],
      practitionerBlockedRanges: [],
      venueTimezone: 'Europe/London',
      minNoticeHours: 0,
      skipPastSlotFilter: true,
    };

    const result = computeAppointmentAvailability(input, 9 * 60);
    const p = result.practitioners.find((x) => x.id === 'p1');
    const starts = (p?.slots ?? []).filter((s) => s.service_id === 'svc1').map((s) => s.start_time);
    expect(starts).not.toContain('09:00');
    expect(starts).not.toContain('09:15');
    expect(starts).toContain('10:00');
  });
});
