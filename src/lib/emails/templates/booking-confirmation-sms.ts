import type { BookingEmailData, VenueEmailData, RenderedSms } from '../types';
import { formatDate, formatTime } from './base-template';

function isAppointment(booking: BookingEmailData): boolean {
  return (
    booking.email_variant === 'appointment' ||
    Boolean(booking.group_appointments?.length || booking.practitioner_name || booking.appointment_service_name)
  );
}

export function renderBookingConfirmationSms(
  booking: BookingEmailData,
  venue: VenueEmailData,
  customMessage?: string | null,
): RenderedSms {
  const date = formatDate(booking.booking_date);
  const time = formatTime(booking.booking_time);
  const appt = isAppointment(booking);

  const parts: string[] = [];
  if (customMessage?.trim()) parts.push(customMessage.trim());

  const core = appt
    ? `${venue.name}: Hi ${booking.guest_name}, your appointment on ${date} at ${time} is confirmed.`
    : `${venue.name}: Hi ${booking.guest_name}, your booking on ${date} at ${time} for ${booking.party_size} is confirmed.`;
  parts.push(core);

  if (booking.manage_booking_link) {
    parts.push(`Manage: ${booking.manage_booking_link}`);
  }

  return { body: parts.join(' ') };
}
