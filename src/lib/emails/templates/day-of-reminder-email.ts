import type { BookingEmailData, VenueEmailData, RenderedEmail } from '../types';
import { renderBaseTemplate, formatDate, formatTime } from './base-template';

function mapsLink(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

export function renderDayOfReminderEmail(
  booking: BookingEmailData,
  venue: VenueEmailData,
  customMessage?: string | null,
): RenderedEmail {
  const date = formatDate(booking.booking_date);
  const time = formatTime(booking.booking_time);

  const [h] = booking.booking_time.slice(0, 5).split(':').map(Number);
  const timeOfDay = (h ?? 18) < 15 ? 'today' : 'tonight';

  let addressWithLink = venue.address ?? null;
  if (venue.address) {
    addressWithLink = `<a href="${mapsLink(venue.address)}" target="_blank" style="color:#4E6B78;text-decoration:underline">${venue.address}</a>`;
  }

  const mainContent = `<p style="margin:0 0 12px 0">We're looking forward to seeing you ${timeOfDay}!</p>`;

  const html = renderBaseTemplate({
    venueName: venue.name,
    venueLogoUrl: venue.logo_url,
    heading: `See you ${timeOfDay} at ${venue.name}!`,
    mainContent,
    bookingDate: date,
    bookingTime: time,
    partySize: booking.party_size,
    venueAddress: venue.address,
    specialRequests: booking.special_requests ?? booking.dietary_notes,
    customMessage,
    ctaLabel: booking.manage_booking_link ? 'Manage Booking' : undefined,
    ctaUrl: booking.manage_booking_link,
  });

  const textParts = [
    `Hi ${booking.guest_name},`,
    '',
    `We're looking forward to seeing you ${timeOfDay} at ${venue.name}!`,
    '',
    `Date: ${date}`,
    `Time: ${time}`,
    `Party size: ${booking.party_size}`,
  ];
  if (venue.address) textParts.push(`Address: ${venue.address}`);
  if (booking.special_requests) textParts.push(`Special requests: ${booking.special_requests}`);
  if (customMessage) textParts.push('', customMessage);
  if (booking.manage_booking_link) textParts.push('', `Manage your booking: ${booking.manage_booking_link}`);
  textParts.push('', venue.name);

  return {
    subject: `See you ${timeOfDay} at ${venue.name}!`,
    html,
    text: textParts.join('\n'),
  };
}
