import type { BookingEmailData, VenueEmailData, RenderedEmail } from '../types';
import { renderBaseTemplate } from './base-template';

function isAppointment(booking: BookingEmailData): boolean {
  return (
    booking.email_variant === 'appointment' ||
    Boolean(booking.group_appointments?.length || booking.practitioner_name || booking.appointment_service_name)
  );
}

export function renderPostVisitEmail(
  booking: BookingEmailData,
  venue: VenueEmailData,
  customMessage?: string | null,
): RenderedEmail {
  const bookAgainUrl = venue.booking_page_url
    ?? `${process.env.NEXT_PUBLIC_BASE_URL || 'https://www.reserveni.com'}/book/${venue.name.toLowerCase().replace(/\s+/g, '-')}`;

  const appt = isAppointment(booking);
  const mainContent = appt
    ? [
        '<p style="margin:0 0 12px 0">We hope you were happy with your visit.</p>',
        '<p style="margin:0 0 12px 0">We would love to see you again. Book your next appointment anytime.</p>',
      ].join('')
    : [
        '<p style="margin:0 0 12px 0">We hope you enjoyed your visit.</p>',
        '<p style="margin:0 0 12px 0">We would love to welcome you back. Book your next visit anytime.</p>',
      ].join('');

  const html = renderBaseTemplate({
    venueName: venue.name,
    venueLogoUrl: venue.logo_url,
    heading: appt ? `Thanks for visiting ${venue.name}` : `Thanks for visiting ${venue.name}!`,
    mainContent,
    customMessage,
    ctaLabel: 'Book again',
    ctaUrl: bookAgainUrl,
    footerNote: appt
      ? `You received this email because you had an appointment at ${venue.name}.`
      : `You received this email because you visited ${venue.name}.`,
  });

  const textParts = [`Hi ${booking.guest_name},`, ''];
  if (appt) {
    textParts.push(`We hope you were happy with your appointment at ${venue.name}.`, '', `Book again: ${bookAgainUrl}`);
  } else {
    textParts.push(`We hope you enjoyed your visit to ${venue.name}.`, '', `We would love to welcome you back. Book your next visit anytime.`, '', `Book again: ${bookAgainUrl}`);
  }
  if (customMessage) textParts.push('', customMessage);
  textParts.push('', venue.name);

  return {
    subject: appt ? `Thanks for visiting ${venue.name}` : `Thanks for visiting ${venue.name}!`,
    html,
    text: textParts.join('\n'),
  };
}
