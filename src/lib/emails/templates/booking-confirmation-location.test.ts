import { describe, expect, it } from 'vitest';
import { renderBookingConfirmationDocumentHtml } from '@/lib/emails/templates/booking-confirmation-layout';
import type { BookingEmailData, VenueEmailData } from '@/lib/emails/types';

const venue: VenueEmailData = {
  name: 'Test Venue',
  address: '1 Main Street, Belfast, BT1 1AA',
};

function booking(overrides: Partial<BookingEmailData> = {}): BookingEmailData {
  return {
    id: 'b1',
    guest_name: 'Alex Guest',
    booking_date: '2026-06-20',
    booking_time: '10:00',
    party_size: 1,
    email_variant: 'appointment',
    appointment_service_name: 'Treatment',
    ...overrides,
  };
}

function render(b: BookingEmailData): string {
  return renderBookingConfirmationDocumentHtml({
    booking: b,
    venue,
    appointmentStyle: true,
    emailVariant: 'appointment',
    blocks: { preambleHtml: '', depositHtml: null, customMessage: null, postCtaAccountHtml: null },
  });
}

describe('booking confirmation location card', () => {
  it('business venue (default): venue address + directions, no join button', () => {
    const html = render(booking());
    expect(html).toContain('1 Main Street, Belfast, BT1 1AA');
    expect(html).toContain('Get directions');
    expect(html).not.toContain('Join online');
  });

  it("client address: client's address replaces the venue address; no directions", () => {
    const html = render(
      booking({
        booking_location: { kind: 'client_address', client_address: '5 Oak Road, Lisburn, BT28 9XY' },
      }),
    );
    expect(html).toContain('Your address');
    expect(html).toContain('5 Oak Road, Lisburn, BT28 9XY');
    expect(html).toContain('We come to you for this appointment.');
    expect(html).not.toContain('Get directions');
    expect(html).not.toContain('1 Main Street, Belfast, BT1 1AA');
  });

  it('online: join button + info replace the venue address; no directions', () => {
    const html = render(
      booking({
        booking_location: {
          kind: 'online',
          online_url: 'https://zoom.us/j/123',
          online_info: 'Passcode 9876',
        },
      }),
    );
    expect(html).toContain('>Online<');
    expect(html).toContain('https://zoom.us/j/123');
    expect(html).toContain('Join online');
    expect(html).toContain('Passcode 9876');
    expect(html).not.toContain('Get directions');
    expect(html).not.toContain('1 Main Street, Belfast, BT1 1AA');
  });

  it('online without a link still renders the online card without a join button', () => {
    const html = render(
      booking({ booking_location: { kind: 'online', online_url: null, online_info: null } }),
    );
    expect(html).toContain('delivered online');
    expect(html).not.toContain('Join online');
  });
});
