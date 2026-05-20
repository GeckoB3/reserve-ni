import { describe, expect, it } from 'vitest';
import { findMatchingWaitlistEntries } from '@/lib/booking/offer-appointment-waitlist-on-cancel';
import { cancelledBookingFromFreedSlot } from '@/lib/booking/waitlist-freed-slot';

describe('waitlist cascade matching', () => {
  it('finds next guest for the same freed slot', () => {
    const slot = cancelledBookingFromFreedSlot({
      venueId: 'v1',
      slotDate: '2026-06-15',
      slotTime: '14:30:00',
      calendarId: 'cal-1',
      appointmentServiceId: null,
      serviceItemId: 'svc-1',
    });

    const entries = [
      {
        id: 'w1',
        desired_date: '2026-06-15',
        desired_time: null,
        desired_time_end: null,
        practitioner_id: 'cal-1',
        appointment_service_id: null,
        service_item_id: 'svc-1',
        guest_first_name: 'A',
        guest_last_name: 'One',
        guest_email: null,
        guest_phone: '+447700900001',
        created_at: '2026-06-10T10:00:00Z',
      },
      {
        id: 'w2',
        desired_date: '2026-06-15',
        desired_time: null,
        desired_time_end: null,
        practitioner_id: null,
        appointment_service_id: null,
        service_item_id: 'svc-1',
        guest_first_name: 'B',
        guest_last_name: 'Two',
        guest_email: null,
        guest_phone: '+447700900002',
        created_at: '2026-06-11T10:00:00Z',
      },
      {
        id: 'w3',
        desired_date: '2026-06-15',
        desired_time: '10:00',
        desired_time_end: '12:00',
        practitioner_id: null,
        appointment_service_id: null,
        service_item_id: 'svc-1',
        guest_first_name: 'C',
        guest_last_name: 'Three',
        guest_email: null,
        guest_phone: '+447700900003',
        created_at: '2026-06-09T10:00:00Z',
      },
    ];

    const matches = findMatchingWaitlistEntries(entries, slot);
    expect(matches.map((m) => m.id)).toEqual(['w1', 'w2']);
  });

  it('excludes guests requesting a different calendar', () => {
    const slot = cancelledBookingFromFreedSlot({
      venueId: 'v1',
      slotDate: '2026-06-15',
      slotTime: '14:30:00',
      calendarId: 'cal-2',
      appointmentServiceId: null,
      serviceItemId: 'svc-1',
    });

    const matches = findMatchingWaitlistEntries(
      [
        {
          id: 'w1',
          desired_date: '2026-06-15',
          desired_time: null,
          practitioner_id: 'cal-1',
          appointment_service_id: null,
          service_item_id: 'svc-1',
          guest_first_name: 'A',
          guest_last_name: 'One',
          guest_email: null,
          guest_phone: '+447700900001',
          created_at: '2026-06-10T10:00:00Z',
        },
      ],
      slot,
    );
    expect(matches).toHaveLength(0);
  });
});
