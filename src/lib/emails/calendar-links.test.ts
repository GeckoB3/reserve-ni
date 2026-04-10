import { describe, it, expect } from 'vitest';
import { buildGoogleCalendarAddUrlForBooking } from './calendar-links';
import type { BookingEmailData, VenueEmailData } from './types';

const venue: VenueEmailData = {
  name: 'Test Venue',
  address: '1 High St, Belfast',
  timezone: 'Europe/London',
};

describe('buildGoogleCalendarAddUrlForBooking', () => {
  it('returns a Google Calendar URL with dates and location', () => {
    const booking: BookingEmailData = {
      id: 'b1',
      guest_name: 'Alex',
      booking_date: '2026-06-15',
      booking_time: '19:30',
      party_size: 2,
      booking_model: 'table_reservation',
    };
    const url = buildGoogleCalendarAddUrlForBooking(booking, venue);
    expect(url).toBeTruthy();
    expect(url).toContain('calendar.google.com/calendar/render');
    expect(url).toContain('action=TEMPLATE');
    expect(url).toContain('text=');
    expect(url).toContain('location=');
    expect(url).toMatch(/High\+St|High%20St/);
  });

  it('returns null for invalid time', () => {
    const booking: BookingEmailData = {
      id: 'b1',
      guest_name: 'Alex',
      booking_date: '2026-06-15',
      booking_time: 'invalid',
      party_size: 1,
    };
    expect(buildGoogleCalendarAddUrlForBooking(booking, venue)).toBeNull();
  });
});
