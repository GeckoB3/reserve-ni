import type { BookingEmailData, VenueEmailData, RenderedEmail } from '../types';
import { renderBaseTemplate, formatDate, formatTime, formatDepositAmount } from './base-template';

const AMBER_BG = '#FFF3CD';
const AMBER_TEXT = '#664D03';

function buildRefundNotice(amount: string, refundCutoff: string): string {
  return [
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:${AMBER_BG};border:1px solid #FFE69C;border-radius:8px;margin:16px 0">`,
    `<tr><td style="padding:16px;font-size:14px;color:${AMBER_TEXT}">`,
    `<strong>Deposit refund notice</strong><br/>`,
    `You've paid a deposit of £${amount}. If your plans change, you can cancel for a full refund before <strong>${refundCutoff}</strong>. After this time, the deposit is non-refundable.`,
    '</td></tr></table>',
  ].join('');
}

export function renderReminder56h(
  booking: BookingEmailData,
  venue: VenueEmailData,
  customMessage?: string | null,
): RenderedEmail {
  const date = formatDate(booking.booking_date);
  const time = formatTime(booking.booking_time);
  const hasDeposit = booking.deposit_status === 'Paid' && booking.deposit_amount_pence;

  let depositHtml: string | null = null;
  if (hasDeposit && booking.refund_cutoff) {
    depositHtml = buildRefundNotice(formatDepositAmount(booking.deposit_amount_pence!), booking.refund_cutoff);
  }

  const mainContent = hasDeposit
    ? '<p style="margin:0 0 12px 0">Just a reminder about your upcoming booking:</p>'
    : '<p style="margin:0 0 12px 0">Just a reminder about your upcoming booking. If your plans have changed, please let us know so we can offer the table to someone else.</p>';

  const html = renderBaseTemplate({
    venueName: venue.name,
    venueLogoUrl: venue.logo_url,
    heading: `Reminder: Your booking at ${venue.name}`,
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
    'Just a reminder about your upcoming booking:',
    '',
    `Date: ${date}`,
    `Time: ${time}`,
    `Party size: ${booking.party_size}`,
  ];
  if (venue.address) textParts.push(`Address: ${venue.address}`);
  if (hasDeposit && booking.refund_cutoff) {
    textParts.push('', `You've paid a deposit of £${formatDepositAmount(booking.deposit_amount_pence!)}. Full refund if cancelled before ${booking.refund_cutoff}. Non-refundable after that.`);
  } else {
    textParts.push('', 'If your plans have changed, please let us know so we can offer the table to someone else.');
  }
  if (customMessage) textParts.push('', customMessage);
  if (booking.manage_booking_link) textParts.push('', `Manage your booking: ${booking.manage_booking_link}`);
  textParts.push('', venue.name);

  return {
    subject: `Reminder: Your booking at ${venue.name} on ${date}`,
    html,
    text: textParts.join('\n'),
  };
}
