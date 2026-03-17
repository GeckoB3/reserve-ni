import type { BookingEmailData, VenueEmailData, RenderedEmail, RenderedSms } from '../types';
import { renderBaseTemplate, formatDate, formatTime } from './base-template';

const AMBER_BG = '#FFF3CD';
const AMBER_TEXT = '#664D03';

function buildRefundCallout(refundMessage: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:${AMBER_BG};border:1px solid #FFE69C;border-radius:8px;margin:16px 0"><tr><td style="padding:16px;font-size:14px;color:${AMBER_TEXT}">${refundMessage}</td></tr></table>`;
}

export function renderBookingCancellation(
  booking: BookingEmailData,
  venue: VenueEmailData,
  refundMessage?: string | null,
  customMessage?: string | null,
): RenderedEmail {
  const date = formatDate(booking.booking_date);
  const time = formatTime(booking.booking_time);

  const mainContent = '<p style="margin:0 0 12px 0">Your reservation has been cancelled.</p>';

  const refundHtml = refundMessage ? buildRefundCallout(refundMessage) : null;

  const html = renderBaseTemplate({
    venueName: venue.name,
    venueLogoUrl: venue.logo_url,
    heading: `Booking cancelled \u2013 ${venue.name}`,
    mainContent,
    bookingDate: date,
    bookingTime: time,
    partySize: booking.party_size,
    venueAddress: venue.address,
    depositInfoHtml: refundHtml,
    customMessage,
    footerNote: 'We hope to see you another time.',
  });

  const textParts = [
    `Hi ${booking.guest_name},`,
    '',
    `Your reservation at ${venue.name} has been cancelled.`,
    '',
    `Date: ${date}`,
    `Time: ${time}`,
    `Party size: ${booking.party_size}`,
  ];
  if (refundMessage) textParts.push('', refundMessage);
  if (customMessage) textParts.push('', customMessage);
  textParts.push('', 'We hope to see you another time.', venue.name);

  return {
    subject: `Booking cancelled \u2013 ${venue.name}`,
    html,
    text: textParts.join('\n'),
  };
}

export function renderBookingCancellationSms(
  booking: BookingEmailData,
  venue: VenueEmailData,
  refundMessage?: string | null,
): RenderedSms {
  const date = formatDate(booking.booking_date);
  const time = formatTime(booking.booking_time);
  const refundPart = refundMessage ? ` ${refundMessage}` : '';
  return {
    body: `${venue.name}: Your booking for ${date} at ${time} has been cancelled.${refundPart} We hope to see you another time.`,
  };
}
