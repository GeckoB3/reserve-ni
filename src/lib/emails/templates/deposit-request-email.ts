import type { BookingEmailData, VenueEmailData, RenderedEmail } from '../types';
import { renderBaseTemplate, formatDate, formatTime, formatDepositAmount } from './base-template';

export function renderDepositRequestEmail(
  booking: BookingEmailData,
  venue: VenueEmailData,
  paymentLink: string,
  customMessage?: string | null,
): RenderedEmail {
  const date = formatDate(booking.booking_date);
  const time = formatTime(booking.booking_time);
  const amount = booking.deposit_amount_pence ? formatDepositAmount(booking.deposit_amount_pence) : '0.00';

  const html = renderBaseTemplate({
    venueName: venue.name,
    venueLogoUrl: venue.logo_url,
    heading: `Deposit required — ${venue.name}`,
    mainContent: `<p style="margin:0 0 12px 0">Please pay your deposit of <strong>£${amount}</strong> to secure your booking.</p>`,
    bookingDate: date,
    bookingTime: time,
    partySize: booking.party_size,
    venueAddress: venue.address,
    specialRequests: booking.special_requests ?? booking.dietary_notes,
    customMessage: customMessage?.trim() || null,
    ctaLabel: 'Pay deposit',
    ctaUrl: paymentLink,
  });

  const textParts = [
    `Hi ${booking.guest_name},`,
    '',
    `${venue.name}: your booking on ${date} at ${time} for ${booking.party_size} requires a deposit of £${amount}.`,
    '',
    `Pay here: ${paymentLink}`,
  ];
  if (customMessage?.trim()) textParts.splice(3, 0, '', customMessage.trim());
  if (venue.address) textParts.push('', `Address: ${venue.address}`);
  textParts.push('', venue.name);

  return {
    subject: `Pay your deposit for ${venue.name}`,
    html,
    text: textParts.join('\n'),
  };
}
