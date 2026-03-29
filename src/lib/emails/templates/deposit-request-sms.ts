import type { BookingEmailData, VenueEmailData, RenderedSms } from '../types';
import { formatRefundDeadlineIso, isDepositRefundAvailableAt } from '@/lib/booking/cancellation-deadline';
import { formatDate, formatTime, formatDepositAmount } from './base-template';

function isAppointment(booking: BookingEmailData): boolean {
  return (
    booking.email_variant === 'appointment' ||
    Boolean(booking.group_appointments?.length || booking.practitioner_name || booking.appointment_service_name)
  );
}

export function renderDepositRequestSms(
  booking: BookingEmailData,
  venue: VenueEmailData,
  paymentLink: string,
  customMessage?: string | null,
): RenderedSms {
  const date = formatDate(booking.booking_date);
  const time = formatTime(booking.booking_time);
  const amount = booking.deposit_amount_pence ? formatDepositAmount(booking.deposit_amount_pence) : '0.00';
  const appt = isAppointment(booking);

  const parts: string[] = [];
  if (customMessage) parts.push(customMessage.trim());

  const core = appt
    ? `${venue.name}: Hi ${booking.guest_name}, your appointment on ${date} at ${time} requires a deposit of £${amount}. Pay here: ${paymentLink}`
    : `${venue.name}: Hi ${booking.guest_name}, your booking on ${date} at ${time} for ${booking.party_size} requires a deposit of £${amount}. Pay here: ${paymentLink}`;
  parts.push(core);
  if (appt && booking.refund_cutoff) {
    parts.push(
      isDepositRefundAvailableAt(booking.refund_cutoff)
        ? `Refund if you cancel before ${formatRefundDeadlineIso(booking.refund_cutoff)}.`
        : 'Deposit not refundable if you cancel (refund deadline has passed).',
    );
  }

  return { body: parts.join(' ') };
}
