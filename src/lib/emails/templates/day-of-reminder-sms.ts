import type { BookingEmailData, VenueEmailData, RenderedSms } from '../types';
import { formatTime } from './base-template';

function isAppointment(booking: BookingEmailData): boolean {
  return (
    booking.email_variant === 'appointment' ||
    Boolean(booking.group_appointments?.length || booking.practitioner_name || booking.appointment_service_name)
  );
}

export function renderDayOfReminderSms(
  booking: BookingEmailData,
  venue: VenueEmailData,
  customMessage?: string | null,
): RenderedSms {
  const time = formatTime(booking.booking_time);
  const [h] = booking.booking_time.slice(0, 5).split(':').map(Number);
  const timeOfDay = (h ?? 18) < 15 ? 'today' : 'tonight';
  const appt = isAppointment(booking);

  const parts: string[] = [];
  if (customMessage) parts.push(customMessage.trim());

  const msg = appt
    ? `Reminder: your appointment at ${venue.name} ${timeOfDay} at ${time}.`
    : `Looking forward to seeing you at ${venue.name} ${timeOfDay} at ${time}!`;
  if (booking.manage_booking_link) {
    parts.push(
      appt
        ? `${msg} Manage or cancel: ${booking.manage_booking_link}`
        : `${msg} If your plans have changed: ${booking.manage_booking_link}`,
    );
  } else {
    parts.push(msg);
  }

  return { body: parts.join(' ') };
}
