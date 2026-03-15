import type { BookingEmailData, VenueEmailData, RenderedEmail } from '../types';
import { renderBaseTemplate, buildDepositCallout, formatDate, formatTime, formatDepositAmount } from './base-template';

export function renderDepositConfirmation(
  booking: BookingEmailData,
  venue: VenueEmailData,
  customMessage?: string | null,
): RenderedEmail {
  const date = formatDate(booking.booking_date);
  const time = formatTime(booking.booking_time);
  const amount = booking.deposit_amount_pence ? formatDepositAmount(booking.deposit_amount_pence) : '0.00';

  const depositHtml = buildDepositCallout(amount, booking.refund_cutoff ?? null);

  const html = renderBaseTemplate({
    venueName: venue.name,
    venueLogoUrl: venue.logo_url,
    heading: `Deposit confirmed for your booking at ${venue.name}`,
    mainContent: `<p style="margin:0 0 12px 0">Thank you — your deposit of £${amount} has been received.</p>`,
    bookingDate: date,
    bookingTime: time,
    partySize: booking.party_size,
    venueAddress: venue.address,
    depositInfoHtml: depositHtml,
    customMessage,
    ctaLabel: booking.manage_booking_link ? 'Manage Booking' : undefined,
    ctaUrl: booking.manage_booking_link,
  });

  const textParts = [
    `Hi ${booking.guest_name},`,
    '',
    `Thank you — your deposit of £${amount} has been received for your booking at ${venue.name}.`,
    '',
    `Date: ${date}`,
    `Time: ${time}`,
    `Party size: ${booking.party_size}`,
  ];
  if (booking.refund_cutoff) {
    textParts.push('', `Your deposit is fully refundable if you cancel before ${booking.refund_cutoff}.`);
  }
  if (customMessage) textParts.push('', customMessage);
  if (booking.manage_booking_link) textParts.push('', `Manage your booking: ${booking.manage_booking_link}`);
  textParts.push('', venue.name);

  return {
    subject: `Deposit confirmed for your booking at ${venue.name}`,
    html,
    text: textParts.join('\n'),
  };
}
