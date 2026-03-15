import type { BookingEmailData, VenueEmailData, RenderedEmail } from '../types';
import { renderBaseTemplate } from './base-template';

export function renderPostVisitEmail(
  booking: BookingEmailData,
  venue: VenueEmailData,
  customMessage?: string | null,
): RenderedEmail {
  const bookAgainUrl = venue.booking_page_url
    ?? `${process.env.NEXT_PUBLIC_BASE_URL || 'https://www.reserveni.com'}/book/${venue.name.toLowerCase().replace(/\s+/g, '-')}`;

  const mainContent = [
    '<p style="margin:0 0 12px 0">We hope you enjoyed your visit.</p>',
    '<p style="margin:0 0 12px 0">We\'d love to welcome you back — book your next visit anytime.</p>',
  ].join('');

  const html = renderBaseTemplate({
    venueName: venue.name,
    venueLogoUrl: venue.logo_url,
    heading: `Thanks for visiting ${venue.name}!`,
    mainContent,
    customMessage,
    ctaLabel: 'Book Again',
    ctaUrl: bookAgainUrl,
    footerNote: `You received this email because you dined at ${venue.name}.`,
  });

  const textParts = [
    `Hi ${booking.guest_name},`,
    '',
    `We hope you enjoyed your visit to ${venue.name}.`,
    '',
    `We'd love to welcome you back — book your next visit anytime.`,
  ];
  if (customMessage) textParts.push('', customMessage);
  textParts.push('', `Book again: ${bookAgainUrl}`);
  textParts.push('', venue.name);

  return {
    subject: `Thanks for visiting ${venue.name}!`,
    html,
    text: textParts.join('\n'),
  };
}
