import type { BookingEmailData, VenueEmailData, RenderedEmail, RenderedSms } from '../types';
import { renderBaseTemplate, buildDepositCallout, formatDate, formatTime, formatDepositAmount } from './base-template';

export function renderBookingModification(
  booking: BookingEmailData,
  venue: VenueEmailData,
  customMessage?: string | null,
): RenderedEmail {
  const date = formatDate(booking.booking_date);
  const time = formatTime(booking.booking_time);
  const depositPaid = booking.deposit_status === 'Paid' && booking.deposit_amount_pence;

  let depositHtml: string | null = null;
  if (depositPaid) {
    depositHtml = buildDepositCallout(
      formatDepositAmount(booking.deposit_amount_pence!),
      booking.refund_cutoff ?? null,
    );
  }

  const mainContent = '<p style="margin:0 0 12px 0">Your reservation has been updated. Here are your new booking details:</p>';

  const html = renderBaseTemplate({
    venueName: venue.name,
    venueLogoUrl: venue.logo_url,
    heading: `Your booking at ${venue.name} has been updated`,
    mainContent,
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
    `Your reservation at ${venue.name} has been updated.`,
    '',
    'New details:',
    `Date: ${date}`,
    `Time: ${time}`,
    `Party size: ${booking.party_size}`,
  ];
  if (venue.address) textParts.push(`Address: ${venue.address}`);
  if (depositPaid) {
    textParts.push('', `Deposit paid: £${formatDepositAmount(booking.deposit_amount_pence!)}`);
  }
  if (customMessage) textParts.push('', customMessage);
  if (booking.manage_booking_link) textParts.push('', `Manage your booking: ${booking.manage_booking_link}`);
  textParts.push('', 'If you have any questions, please contact us.', venue.name);

  return {
    subject: `Your reservation at ${venue.name} has been updated`,
    html,
    text: textParts.join('\n'),
  };
}

export function renderBookingModificationSms(
  booking: BookingEmailData,
  venue: VenueEmailData,
  _customMessage?: string | null,
): RenderedSms {
  const date = formatDate(booking.booking_date);
  const time = formatTime(booking.booking_time);
  return {
    body: `${venue.name}: Your booking has been updated to ${date} at ${time} (${booking.party_size} guest${booking.party_size !== 1 ? 's' : ''}).`,
  };
}
