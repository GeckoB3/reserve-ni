import type { BookingEmailData, VenueEmailData, RenderedSms } from '../types';
import { formatTime } from './base-template';

export function renderDayOfReminderSms(
  booking: BookingEmailData,
  venue: VenueEmailData,
  customMessage?: string | null,
): RenderedSms {
  const time = formatTime(booking.booking_time);
  const [h] = booking.booking_time.slice(0, 5).split(':').map(Number);
  const timeOfDay = (h ?? 18) < 15 ? 'today' : 'tonight';

  const parts: string[] = [];
  if (customMessage) parts.push(customMessage.trim());

  let msg = `Looking forward to seeing you at ${venue.name} ${timeOfDay} at ${time}!`;
  if (booking.manage_booking_link) {
    msg += ` If your plans have changed, please let us know: ${booking.manage_booking_link}`;
  }
  parts.push(msg);

  return { body: parts.join(' ') };
}
