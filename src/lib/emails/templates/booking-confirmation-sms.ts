import type { BookingEmailData, VenueEmailData, RenderedSms } from '../types';
import { isCdeBookingModel } from '@/lib/booking/cde-booking';
import { formatDate, formatTime } from './base-template';

function isAppointmentStyle(booking: BookingEmailData): boolean {
  return (
    booking.email_variant === 'appointment' ||
    Boolean(booking.group_appointments?.length || booking.practitioner_name || booking.appointment_service_name) ||
    isCdeBookingModel(booking.booking_model)
  );
}

export function renderBookingConfirmationSms(
  booking: BookingEmailData,
  venue: VenueEmailData,
  customMessage?: string | null,
): RenderedSms {
  const date = formatDate(booking.booking_date);
  const time = formatTime(booking.booking_time);
  const appt = isAppointmentStyle(booking);

  const parts: string[] = [];
  if (customMessage?.trim()) parts.push(customMessage.trim());

  let core: string;
  if (booking.booking_model === 'event_ticket') {
    core = `${venue.name}: Hi ${booking.guest_name}, your event on ${date} at ${time} is confirmed.`;
  } else if (booking.booking_model === 'class_session') {
    core = `${venue.name}: Hi ${booking.guest_name}, your class on ${date} at ${time} is confirmed.`;
  } else if (booking.booking_model === 'resource_booking') {
    core = `${venue.name}: Hi ${booking.guest_name}, your booking on ${date} at ${time} is confirmed.`;
  } else if (appt) {
    core = `${venue.name}: Hi ${booking.guest_name}, your appointment on ${date} at ${time} is confirmed.`;
  } else {
    core = `${venue.name}: Hi ${booking.guest_name}, your booking on ${date} at ${time} for ${booking.party_size} is confirmed.`;
  }
  parts.push(core);
  if (isCdeBookingModel(booking.booking_model) && booking.appointment_service_name) {
    parts.push(booking.appointment_service_name);
  }

  if (booking.manage_booking_link) {
    parts.push(`Manage: ${booking.manage_booking_link}`);
  }

  return { body: parts.join(' ') };
}
