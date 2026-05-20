import { describe, expect, it } from 'vitest';
import {
  validateBookingAgainstWaitlistOffer,
  type ActiveWaitlistOfferRow,
} from '@/lib/booking/validate-waitlist-offer-access';
import { wasWaitlistOfferNotifySuccessful } from '@/lib/booking/waitlist-offer-notify-success';

const baseOffer: ActiveWaitlistOfferRow = {
  id: 'offer-1',
  venue_id: 'venue-1',
  desired_date: '2026-06-15',
  desired_time: '14:00:00',
  desired_time_end: null,
  practitioner_id: null,
  appointment_service_id: 'svc-1',
  service_item_id: null,
  offered_slot_time: '14:30:00',
  offered_calendar_id: 'cal-1',
  expires_at: '2026-06-15T15:00:00.000Z',
  status: 'confirmed',
};

describe('validateBookingAgainstWaitlistOffer', () => {
  it('accepts a booking that matches the offered slot', () => {
    const result = validateBookingAgainstWaitlistOffer(baseOffer, {
      bookingDate: '2026-06-15',
      bookingTimeHm: '14:30',
      practitionerOrCalendarId: 'cal-1',
      appointmentServiceId: 'svc-1',
    });
    expect(result).toEqual({ ok: true });
  });

  it('rejects mismatched date, service, calendar, and time', () => {
    expect(
      validateBookingAgainstWaitlistOffer(baseOffer, {
        bookingDate: '2026-06-16',
        bookingTimeHm: '14:30',
        practitionerOrCalendarId: 'cal-1',
        appointmentServiceId: 'svc-1',
      }),
    ).toEqual({ ok: false, message: 'Booking date does not match your waitlist offer.' });

    expect(
      validateBookingAgainstWaitlistOffer(baseOffer, {
        bookingDate: '2026-06-15',
        bookingTimeHm: '14:30',
        practitionerOrCalendarId: 'cal-1',
        appointmentServiceId: 'other',
      }),
    ).toEqual({ ok: false, message: 'Booking service does not match your waitlist offer.' });

    expect(
      validateBookingAgainstWaitlistOffer(baseOffer, {
        bookingDate: '2026-06-15',
        bookingTimeHm: '14:30',
        practitionerOrCalendarId: 'cal-2',
        appointmentServiceId: 'svc-1',
      }),
    ).toEqual({ ok: false, message: 'This practitioner does not match your waitlist offer.' });

    expect(
      validateBookingAgainstWaitlistOffer(baseOffer, {
        bookingDate: '2026-06-15',
        bookingTimeHm: '15:00',
        practitionerOrCalendarId: 'cal-1',
        appointmentServiceId: 'svc-1',
      }),
    ).toEqual({ ok: false, message: 'Booking time does not match your waitlist offer.' });
  });
});

describe('wasWaitlistOfferNotifySuccessful', () => {
  it('requires a delivered channel and rejects skipped sends', () => {
    expect(wasWaitlistOfferNotifySuccessful({ emailSent: true, smsSent: false })).toBe(true);
    expect(wasWaitlistOfferNotifySuccessful({ emailSent: false, smsSent: true })).toBe(true);
    expect(wasWaitlistOfferNotifySuccessful({ emailSent: false, smsSent: false })).toBe(false);
    expect(
      wasWaitlistOfferNotifySuccessful({ emailSent: false, smsSent: false, skipped: true }),
    ).toBe(false);
  });
});
