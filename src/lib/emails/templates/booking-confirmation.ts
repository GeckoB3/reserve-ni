import type { BookingEmailData, VenueEmailData, RenderedEmail } from '../types';
import { renderBaseTemplate, buildDepositCallout, formatDate, formatTime, formatDepositAmount } from './base-template';

export function renderBookingConfirmation(
  booking: BookingEmailData,
  venue: VenueEmailData,
  customMessage?: string | null,
): RenderedEmail {
  const date = formatDate(booking.booking_date);
  const time = formatTime(booking.booking_time);
  const depositPaid = booking.deposit_status === 'Paid' && booking.deposit_amount_pence;
  const depositPending = booking.deposit_status === 'Pending' && booking.deposit_amount_pence;

  let depositHtml: string | null = null;
  if (depositPaid) {
    depositHtml = buildDepositCallout(
      formatDepositAmount(booking.deposit_amount_pence!),
      booking.refund_cutoff ?? null,
    );
  }

  let mainContent = '<p style="margin:0 0 12px 0">Your reservation is confirmed. We look forward to seeing you!</p>';
  if (depositPending) {
    mainContent += `<p style="margin:0 0 12px 0">A deposit of £${formatDepositAmount(booking.deposit_amount_pence!)} is required. You\'ll receive a separate message with payment details shortly.</p>`;
  }

  const html = renderBaseTemplate({
    venueName: venue.name,
    venueLogoUrl: venue.logo_url,
    heading: `Your booking at ${venue.name} is confirmed`,
    mainContent,
    bookingDate: date,
    bookingTime: time,
    partySize: booking.party_size,
    venueAddress: venue.address,
    specialRequests: booking.special_requests ?? booking.dietary_notes,
    depositInfoHtml: depositHtml,
    customMessage,
    ctaLabel: booking.manage_booking_link ? 'Manage Booking' : undefined,
    ctaUrl: booking.manage_booking_link,
  });

  const textParts = [
    `Hi ${booking.guest_name},`,
    '',
    `Your reservation at ${venue.name} is confirmed.`,
    '',
    `Date: ${date}`,
    `Time: ${time}`,
    `Party size: ${booking.party_size}`,
  ];
  if (venue.address) textParts.push(`Address: ${venue.address}`);
  if (booking.special_requests) textParts.push(`Special requests: ${booking.special_requests}`);
  if (depositPaid) {
    textParts.push('', `Deposit paid: £${formatDepositAmount(booking.deposit_amount_pence!)}`);
    if (booking.refund_cutoff) textParts.push(`Full refund if cancelled before ${booking.refund_cutoff}. No refund after that or for no-shows.`);
  }
  if (customMessage) textParts.push('', customMessage);
  if (booking.manage_booking_link) textParts.push('', `Manage your booking: ${booking.manage_booking_link}`);
  textParts.push('', `We look forward to seeing you!`, venue.name);

  return {
    subject: `Your booking at ${venue.name} is confirmed`,
    html,
    text: textParts.join('\n'),
  };
}
