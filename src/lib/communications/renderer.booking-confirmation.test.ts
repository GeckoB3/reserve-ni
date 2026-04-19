import { describe, it, expect } from 'vitest';
import { renderCommunicationEmail } from '@/lib/communications/renderer';
import type { BookingEmailData } from '@/lib/emails/types';
import type { VenueEmailData } from '@/lib/emails/types';

const venue: VenueEmailData = { name: 'Test Venue', address: '1 High St' };

function baseBooking(over: Partial<BookingEmailData>): BookingEmailData {
  return {
    id: 'b1',
    guest_name: 'Sam',
    guest_email: 'sam@example.com',
    booking_date: '2026-06-01',
    booking_time: '10:00',
    party_size: 1,
    manage_booking_link: 'https://example.com/m',
    ...over,
  };
}

describe('renderCommunicationEmail booking_confirmation', () => {
  it('includes price in HTML card and pay-at-venue copy when no online payment', () => {
    const out = renderCommunicationEmail({
      lane: 'appointments_other',
      messageKey: 'booking_confirmation',
      booking: baseBooking({
        email_variant: 'appointment',
        appointment_service_name: 'Massage',
        practitioner_name: 'Jo',
        appointment_price_display: '£45.00 (pay at venue)',
        deposit_status: 'Not Required',
      }),
      venue,
    });
    expect(out?.html).toContain('£45.00');
    expect(out?.html).not.toContain('(pay at venue)');
    expect(out?.html).toContain('Payment is due at the venue');
    expect(out?.text).toContain('Price: £45.00');
    expect(out?.text).toContain('Payment is due at the venue');
  });

  it('shows paid in full when deposit_status is Paid and amount meets total', () => {
    const out = renderCommunicationEmail({
      lane: 'appointments_other',
      messageKey: 'booking_confirmation',
      booking: baseBooking({
        email_variant: 'appointment',
        appointment_service_name: 'Class',
        appointment_price_display: '£20.00',
        booking_total_price_pence: 2000,
        deposit_amount_pence: 2000,
        deposit_status: 'Paid',
      }),
      venue,
    });
    expect(out?.html).toContain('Paid in full online');
    expect(out?.text).toMatch(/Paid in full online/);
  });

  it('shows deposit + balance when partially paid online', () => {
    const out = renderCommunicationEmail({
      lane: 'appointments_other',
      messageKey: 'booking_confirmation',
      booking: baseBooking({
        email_variant: 'appointment',
        appointment_service_name: 'Event',
        appointment_price_display: '£50.00',
        booking_total_price_pence: 5000,
        deposit_amount_pence: 2000,
        deposit_status: 'Paid',
      }),
      venue,
    });
    expect(out?.html).toContain('Deposit paid online');
    expect(out?.html).toContain('pay at the venue');
  });
});
