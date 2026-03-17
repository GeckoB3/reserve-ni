import type { BookingEmailData, VenueEmailData, RenderedEmail } from '../types';
import { renderBaseTemplate, formatDate, formatTime, formatDepositAmount } from './base-template';

const AMBER_BG = '#FFF3CD';
const AMBER_TEXT = '#664D03';
const BRAND = '#4E6B78';
const RED = '#DC2626';

function buildRefundNotice(amount: string, refundCutoff: string): string {
  return [
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:${AMBER_BG};border:1px solid #FFE69C;border-radius:8px;margin:16px 0">`,
    `<tr><td style="padding:16px;font-size:14px;color:${AMBER_TEXT}">`,
    `<strong>Deposit refund notice</strong><br/>`,
    `You've paid a deposit of \u00A3${amount}. If your plans change, you can cancel for a full refund before <strong>${refundCutoff}</strong>. After this time, the deposit is non-refundable.`,
    '</td></tr></table>',
  ].join('');
}

function buildActionButtons(confirmCancelLink: string, manageLink?: string | null): string {
  const buttons: string[] = [
    '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:24px 0">',
    '<tr><td>',

    // Confirm button — full-width brand-colored
    '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:12px">',
    `<tr><td align="center" style="background-color:${BRAND};border-radius:8px;text-align:center">`,
    `<a href="${confirmCancelLink}" target="_blank" style="display:block;padding:16px 32px;color:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:14px;font-weight:600;text-decoration:none">Confirm My Booking</a>`,
    '</td></tr></table>',

    // Cancel button — full-width outlined red
    '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:12px">',
    `<tr><td align="center" style="background-color:#ffffff;border:2px solid ${RED};border-radius:8px;text-align:center">`,
    `<a href="${confirmCancelLink}" target="_blank" style="display:block;padding:14px 32px;color:${RED};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:14px;font-weight:600;text-decoration:none">Cancel My Booking</a>`,
    '</td></tr></table>',
  ];

  if (manageLink) {
    buttons.push(
      // Manage booking link — subtle text link
      `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-top:4px">`,
      `<tr><td align="center" style="text-align:center;padding:8px 0">`,
      `<a href="${manageLink}" target="_blank" style="color:${BRAND};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:13px;text-decoration:underline">Manage Booking</a>`,
      '</td></tr></table>',
    );
  }

  buttons.push('</td></tr></table>');
  return buttons.join('\n');
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

  const mainContent = '<p style="margin:0 0 12px 0">You have an upcoming booking. Please confirm you\'re still coming or cancel if your plans have changed, so we can offer the table to someone else.</p>';

  const confirmCancelLink = booking.confirm_cancel_link ?? booking.manage_booking_link ?? '';

  const actionButtonsHtml = confirmCancelLink
    ? buildActionButtons(confirmCancelLink, booking.manage_booking_link)
    : '';

  const html = renderBaseTemplate({
    venueName: venue.name,
    venueLogoUrl: venue.logo_url,
    heading: `Please confirm or cancel your booking`,
    mainContent: mainContent + actionButtonsHtml,
    bookingDate: date,
    bookingTime: time,
    partySize: booking.party_size,
    venueAddress: venue.address,
    depositInfoHtml: depositHtml,
    customMessage,
  });

  const textParts = [
    `Hi ${booking.guest_name},`,
    '',
    'Please confirm or cancel your upcoming booking:',
    '',
    `Date: ${date}`,
    `Time: ${time}`,
    `Party size: ${booking.party_size}`,
  ];
  if (venue.address) textParts.push(`Address: ${venue.address}`);
  if (hasDeposit && booking.refund_cutoff) {
    textParts.push('', `You've paid a deposit of \u00A3${formatDepositAmount(booking.deposit_amount_pence!)}. Full refund if cancelled before ${booking.refund_cutoff}. Non-refundable after that.`);
  }
  if (customMessage) textParts.push('', customMessage);
  if (confirmCancelLink) textParts.push('', `Confirm or cancel: ${confirmCancelLink}`);
  if (booking.manage_booking_link && booking.manage_booking_link !== confirmCancelLink) {
    textParts.push(`Manage your booking: ${booking.manage_booking_link}`);
  }
  textParts.push('', venue.name);

  return {
    subject: `Please confirm your booking at ${venue.name} on ${date}`,
    html,
    text: textParts.join('\n'),
  };
}
