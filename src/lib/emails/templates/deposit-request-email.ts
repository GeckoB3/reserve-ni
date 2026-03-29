import type { BookingEmailData, VenueEmailData, RenderedEmail } from '../types';
import { formatRefundDeadlineIso, isDepositRefundAvailableAt } from '@/lib/booking/cancellation-deadline';
import { renderBaseTemplate, formatDate, formatTime, formatDepositAmount } from './base-template';

function isAppointment(booking: BookingEmailData): boolean {
  return (
    booking.email_variant === 'appointment' ||
    Boolean(booking.group_appointments?.length || booking.practitioner_name || booking.appointment_service_name)
  );
}

export function renderDepositRequestEmail(
  booking: BookingEmailData,
  venue: VenueEmailData,
  paymentLink: string,
  customMessage?: string | null,
): RenderedEmail {
  const date = formatDate(booking.booking_date);
  const time = formatTime(booking.booking_time);
  const amount = booking.deposit_amount_pence ? formatDepositAmount(booking.deposit_amount_pence) : '0.00';
  const appt = isAppointment(booking);

  const lead = appt
    ? `<p style="margin:0 0 12px 0">Please pay your deposit of <strong>£${amount}</strong> to secure your appointment.</p>`
    : `<p style="margin:0 0 12px 0">Please pay your deposit of <strong>£${amount}</strong> to secure your booking.</p>`;

  let depositPolicyHtml = '';
  if (appt && booking.refund_cutoff) {
    const fmt = formatRefundDeadlineIso(booking.refund_cutoff);
    depositPolicyHtml = isDepositRefundAvailableAt(booking.refund_cutoff)
      ? `<p style="margin:12px 0 0 0;font-size:14px;color:#334155;line-height:1.5">You can receive a full refund of this deposit if you cancel before <strong>${fmt}</strong>. After that, the deposit is non-refundable.</p>`
      : `<p style="margin:12px 0 0 0;font-size:14px;color:#92400e;line-height:1.5">Under the venue's policy, the time to cancel for a deposit refund has already passed for this appointment. If you pay now, this deposit is <strong>not refundable</strong> if you cancel.</p>`;
  }

  const html = renderBaseTemplate({
    venueName: venue.name,
    venueLogoUrl: venue.logo_url,
    heading: `Deposit required: ${venue.name}`,
    mainContent: lead + depositPolicyHtml,
    bookingDate: date,
    bookingTime: time,
    partySize: booking.party_size,
    venueAddress: venue.address,
    specialRequests: booking.special_requests ?? booking.dietary_notes,
    customMessage: customMessage?.trim() || null,
    emailVariant: appt ? 'appointment' : 'table',
    practitionerName: booking.practitioner_name ?? null,
    serviceName: booking.appointment_service_name ?? null,
    priceDisplay: booking.appointment_price_display ?? null,
    groupAppointments: booking.group_appointments,
    ctaLabel: 'Pay deposit',
    ctaUrl: paymentLink,
  });

  const textParts = [
    `Hi ${booking.guest_name},`,
    '',
    appt
      ? `${venue.name}: your appointment on ${date} at ${time} requires a deposit of £${amount}.`
      : `${venue.name}: your booking on ${date} at ${time} for ${booking.party_size} requires a deposit of £${amount}.`,
    '',
    `Pay here: ${paymentLink}`,
  ];
  if (customMessage?.trim()) textParts.splice(3, 0, '', customMessage.trim());
  if (appt && booking.refund_cutoff) {
    const fmt = formatRefundDeadlineIso(booking.refund_cutoff);
    textParts.push(
      '',
      isDepositRefundAvailableAt(booking.refund_cutoff)
        ? `Deposit refund: cancel before ${fmt} for a full refund.`
        : 'Note: the deadline to cancel for a deposit refund has already passed. This deposit will not be refundable if you cancel.',
    );
  }
  if (venue.address) textParts.push('', `Address: ${venue.address}`);
  textParts.push('', venue.name);

  return {
    subject: appt ? `Pay your deposit to confirm your appointment at ${venue.name}` : `Pay your deposit for ${venue.name}`,
    html,
    text: textParts.join('\n'),
  };
}
