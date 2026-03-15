import type { BookingEmailData, VenueEmailData, RenderedSms } from '../types';
import { formatDate, formatTime, formatDepositAmount } from './base-template';

export function renderDepositRequestSms(
  booking: BookingEmailData,
  venue: VenueEmailData,
  paymentLink: string,
  customMessage?: string | null,
): RenderedSms {
  const date = formatDate(booking.booking_date);
  const time = formatTime(booking.booking_time);
  const amount = booking.deposit_amount_pence ? formatDepositAmount(booking.deposit_amount_pence) : '0.00';

  const parts: string[] = [];
  if (customMessage) parts.push(customMessage.trim());
  parts.push(
    `${venue.name}: Hi ${booking.guest_name}, your booking on ${date} at ${time} for ${booking.party_size} requires a deposit of £${amount}. Pay here: ${paymentLink}`
  );

  return { body: parts.join(' ') };
}
