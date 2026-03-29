import type { BookingEmailData, VenueEmailData, RenderedEmail } from '../types';
import { formatRefundDeadlineIso, isDepositRefundAvailableAt } from '@/lib/booking/cancellation-deadline';
import { renderBaseTemplate, buildDepositCallout, formatDate, formatTime, formatDepositAmount } from './base-template';

function isAppointment(booking: BookingEmailData): boolean {
  return (
    booking.email_variant === 'appointment' ||
    Boolean(booking.group_appointments?.length || booking.practitioner_name || booking.appointment_service_name)
  );
}

export function renderDepositConfirmation(
  booking: BookingEmailData,
  venue: VenueEmailData,
  customMessage?: string | null,
): RenderedEmail {
  const date = formatDate(booking.booking_date);
  const time = formatTime(booking.booking_time);
  const amount = booking.deposit_amount_pence ? formatDepositAmount(booking.deposit_amount_pence) : '0.00';
  const appt = isAppointment(booking);

  const depositHtml = buildDepositCallout(amount, booking.refund_cutoff ?? null);

  const html = renderBaseTemplate({
    venueName: venue.name,
    venueLogoUrl: venue.logo_url,
    heading: appt ? `Deposit received — your appointment at ${venue.name}` : `Deposit confirmed for your booking at ${venue.name}`,
    mainContent: `<p style="margin:0 0 12px 0">Thank you — your deposit of £${amount} has been received.</p>`,
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
    ctaLabel: booking.manage_booking_link ? (appt ? 'Manage appointment' : 'Manage booking') : undefined,
    ctaUrl: booking.manage_booking_link,
  });

  const textParts = [`Hi ${booking.guest_name},`, ''];
  textParts.push(
    appt
      ? `Thank you — your deposit of £${amount} has been received for your appointment at ${venue.name}.`
      : `Thank you — your deposit of £${amount} has been received for your booking at ${venue.name}.`,
    '',
    `Date: ${date}`,
    `Time: ${time}`,
  );
  if (!appt) textParts.push(`Party size: ${booking.party_size}`);
  if (appt && booking.appointment_service_name) textParts.push(`Treatment: ${booking.appointment_service_name}`);
  if (booking.refund_cutoff) {
    const fmt = formatRefundDeadlineIso(booking.refund_cutoff);
    if (isDepositRefundAvailableAt(booking.refund_cutoff)) {
      textParts.push('', `Your deposit is fully refundable if you cancel before ${fmt}.`);
    } else {
      textParts.push(
        '',
        'Under the venue\'s policy, this deposit is not refundable if you cancel — the deadline to cancel for a refund has already passed.',
      );
    }
  }
  if (customMessage) textParts.push('', customMessage);
  if (booking.manage_booking_link) {
    textParts.push('', appt ? `Manage your appointment: ${booking.manage_booking_link}` : `Manage your booking: ${booking.manage_booking_link}`);
  }
  textParts.push('', venue.name);

  return {
    subject: appt ? `Deposit received — ${venue.name}` : `Deposit confirmed for your booking at ${venue.name}`,
    html,
    text: textParts.join('\n'),
  };
}
