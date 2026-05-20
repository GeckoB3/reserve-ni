import { describe, expect, it } from 'vitest';
import { firstMatchingWaitlistSlot } from '@/lib/booking/waitlist-offer-availability';
import type { AppointmentAvailabilityResult } from '@/lib/availability/appointment-engine';

const serviceId = 'svc-1';

function availabilityResult(
  practitioners: AppointmentAvailabilityResult['practitioners'],
): AppointmentAvailabilityResult {
  return { practitioners };
}

describe('firstMatchingWaitlistSlot', () => {
  it('returns the first slot matching service and all-day preference', () => {
    const match = firstMatchingWaitlistSlot(
      availabilityResult([
        {
          id: 'cal-b',
          name: 'Blair',
          services: [],
          slots: [
            {
              practitioner_id: 'cal-b',
              practitioner_name: 'Blair',
              service_id: serviceId,
              service_name: 'Massage',
              start_time: '15:00',
              duration_minutes: 45,
              price_pence: 4500,
            },
          ],
        },
        {
          id: 'cal-a',
          name: 'Alex',
          services: [],
          slots: [
            {
              practitioner_id: 'cal-a',
              practitioner_name: 'Alex',
              service_id: serviceId,
              service_name: 'Massage',
              start_time: '13:30',
              duration_minutes: 45,
              price_pence: 4500,
            },
          ],
        },
      ]),
      serviceId,
      { desired_time: null, desired_time_end: null },
    );

    expect(match).toEqual({ sampleSlotStartHm: '15:00', sampleCalendarId: 'cal-b' });
  });

  it('respects a specific practitioner restriction', () => {
    const match = firstMatchingWaitlistSlot(
      availabilityResult([
        {
          id: 'cal-a',
          name: 'Alex',
          services: [],
          slots: [
            {
              practitioner_id: 'cal-a',
              practitioner_name: 'Alex',
              service_id: serviceId,
              service_name: 'Massage',
              start_time: '13:30',
              duration_minutes: 45,
              price_pence: 4500,
            },
          ],
        },
        {
          id: 'cal-b',
          name: 'Blair',
          services: [],
          slots: [
            {
              practitioner_id: 'cal-b',
              practitioner_name: 'Blair',
              service_id: serviceId,
              service_name: 'Massage',
              start_time: '14:00',
              duration_minutes: 45,
              price_pence: 4500,
            },
          ],
        },
      ]),
      serviceId,
      { desired_time: null, desired_time_end: null },
      'cal-b',
    );

    expect(match).toEqual({ sampleSlotStartHm: '14:00', sampleCalendarId: 'cal-b' });
  });

  it('filters by requested time window', () => {
    const match = firstMatchingWaitlistSlot(
      availabilityResult([
        {
          id: 'cal-a',
          name: 'Alex',
          services: [],
          slots: [
            {
              practitioner_id: 'cal-a',
              practitioner_name: 'Alex',
              service_id: serviceId,
              service_name: 'Massage',
              start_time: '13:30',
              duration_minutes: 45,
              price_pence: 4500,
            },
            {
              practitioner_id: 'cal-a',
              practitioner_name: 'Alex',
              service_id: serviceId,
              service_name: 'Massage',
              start_time: '16:00',
              duration_minutes: 45,
              price_pence: 4500,
            },
          ],
        },
      ]),
      serviceId,
      { desired_time: '14:00', desired_time_end: '15:00' },
    );

    expect(match).toBeNull();
  });
});
