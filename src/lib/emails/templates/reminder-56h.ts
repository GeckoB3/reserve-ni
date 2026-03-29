import type { BookingEmailData, VenueEmailData, RenderedEmail } from '../types';
import { formatRefundDeadlineIso, isDepositRefundAvailableAt } from '@/lib/booking/cancellation-deadline';
import { renderBaseTemplate, formatDate, formatTime, formatDepositAmount } from './base-template';

const AMBER_BG = '#FFF3CD';
const AMBER_TEXT = '#664D03';
const BRAND = '#4E6B78';
const RED = '#DC2626';

function isAppointment(booking: BookingEmailData): boolean {
  return (
    booking.email_variant === 'appointment' ||
    Boolean(booking.group_appointments?.length || booking.practitioner_name || booking.appointment_service_name)
  );
}

function buildRefundNotice(amount: string, refundCutoffIso: string, at: Date = new Date()): string {
  const fmt = formatRefundDeadlineIso(refundCutoffIso);
  const refundable = isDepositRefundAvailableAt(refundCutoffIso, at);
  const body = refundable
    ? `You've paid a deposit of \u00A3${amount}. If your plans change, you can cancel for a full refund before <strong>${fmt}</strong>. After this time, the deposit is non-refundable.`
    : `You've paid a deposit of \u00A3${amount}. Under the venue's policy, the deadline to cancel for a refund has already passed, so this deposit is not refundable if you cancel.`;
  return [
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:${AMBER_BG};border:1px solid #FFE69C;border-radius:8px;margin:16px 0">`,
    `<tr><td style="padding:16px;font-size:14px;color:${AMBER_TEXT}">`,
    `<strong>Deposit refund notice</strong><br/>`,
    body,
    '</td></tr></table>',
  ].join('');
}

function buildActionButtons(confirmCancelLink: string, manageLink: string | null | undefined, appt: boolean): string {
  const cancelLabel = appt ? 'Cancel appointment' : 'Cancel booking';
  const manageLabel = appt ? 'Manage appointment' : 'Manage booking';
  const buttons: string[] = [
    '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:24px 0">',
    '<tr><td>',
    '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:12px">',
    `<tr><td align="center" style="background-color:${BRAND};border-radius:8px;text-align:center">`,
    `<a href="${confirmCancelLink}" target="_blank" style="display:block;padding:16px 32px;color:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:14px;font-weight:600;text-decoration:none">Confirm or update</a>`,
    '</td></tr></table>',
    '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:12px">',
    `<tr><td align="center" style="background-color:#ffffff;border:2px solid ${RED};border-radius:8px;text-align:center">`,
    `<a href="${confirmCancelLink}" target="_blank" style="display:block;padding:14px 32px;color:${RED};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:14px;font-weight:600;text-decoration:none">${cancelLabel}</a>`,
    '</td></tr></table>',
  ];

  if (manageLink) {
    buttons.push(
      `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-top:4px">`,
      `<tr><td align="center" style="text-align:center;padding:8px 0">`,
      `<a href="${manageLink}" target="_blank" style="color:${BRAND};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:13px;text-decoration:underline">${manageLabel}</a>`,
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
  const appt = isAppointment(booking);

  let depositHtml: string | null = null;
  if (hasDeposit && booking.refund_cutoff) {
    depositHtml = buildRefundNotice(formatDepositAmount(booking.deposit_amount_pence!), booking.refund_cutoff);
  }

  const introTable = appt
    ? `<p style="margin:0 0 12px 0">You have an upcoming appointment. If you can, let us know you are still coming or cancel if your plans have changed. It helps us manage the diary. <strong>If you do not reply, your appointment stays booked</strong> (we will not cancel it automatically).</p>`
    : `<p style="margin:0 0 12px 0">You have an upcoming booking. If you can, please confirm you are still coming or cancel if your plans have changed, so we can offer the table to someone else. <strong>If you do not reply, your booking stays in place</strong>. We will not cancel it automatically.</p>`;

  const confirmCancelLink = booking.confirm_cancel_link ?? booking.manage_booking_link ?? '';

  const actionButtonsHtml = confirmCancelLink ? buildActionButtons(confirmCancelLink, booking.manage_booking_link, appt) : '';

  const html = renderBaseTemplate({
    venueName: venue.name,
    venueLogoUrl: venue.logo_url,
    heading: appt ? `Quick check: your appointment at ${venue.name}` : `Please confirm or cancel your booking`,
    mainContent: introTable + actionButtonsHtml,
    bookingDate: date,
    bookingTime: time,
    partySize: booking.party_size,
    venueAddress: venue.address,
    depositInfoHtml: depositHtml,
    customMessage,
    emailVariant: appt ? 'appointment' : 'table',
    practitionerName: booking.practitioner_name ?? null,
    serviceName: booking.appointment_service_name ?? null,
    priceDisplay: booking.appointment_price_display ?? null,
    groupAppointments: booking.group_appointments,
    footerNote: appt
      ? 'You can update service, staff, date, or time from Manage appointment. No reply needed to keep your appointment.'
      : undefined,
  });

  const textParts = [`Hi ${booking.guest_name},`, ''];
  if (appt) {
    textParts.push(
      'Quick check on your upcoming appointment. If your plans have changed, you can cancel from the link below. If we don’t hear from you, your appointment remains booked.',
      '',
    );
  } else {
    textParts.push('Please confirm or cancel your upcoming booking:', '', '');
  }
  textParts.push(`Date: ${date}`, `Time: ${time}`);
  if (!appt) textParts.push(`Party size: ${booking.party_size}`);
  if (appt && booking.appointment_service_name) textParts.push(`Service: ${booking.appointment_service_name}`);
  if (appt && booking.practitioner_name) textParts.push(`Staff: ${booking.practitioner_name}`);
  if (venue.address) textParts.push(`Address: ${venue.address}`);
  if (hasDeposit && booking.refund_cutoff) {
    const fmt = formatRefundDeadlineIso(booking.refund_cutoff);
    const refundable = isDepositRefundAvailableAt(booking.refund_cutoff);
    textParts.push(
      '',
      refundable
        ? `You've paid a deposit of \u00A3${formatDepositAmount(booking.deposit_amount_pence!)}. Full refund if you cancel before ${fmt}. Non-refundable after that.`
        : `You've paid a deposit of \u00A3${formatDepositAmount(booking.deposit_amount_pence!)}. The deadline to cancel for a refund has already passed; this deposit is not refundable if you cancel.`,
    );
  }
  if (customMessage) textParts.push('', customMessage);
  if (confirmCancelLink) textParts.push('', `Open to confirm or cancel: ${confirmCancelLink}`);
  if (booking.manage_booking_link && booking.manage_booking_link !== confirmCancelLink) {
    textParts.push(`Manage appointment: ${booking.manage_booking_link}`);
  }
  textParts.push('', appt ? 'If you take no action, your appointment stays booked.' : '', venue.name);

  return {
    subject: appt ? `Reminder: your appointment at ${venue.name} on ${date}` : `Please confirm your booking at ${venue.name} on ${date}`,
    html,
    text: textParts.join('\n'),
  };
}
