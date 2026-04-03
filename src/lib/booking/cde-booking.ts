import type { BookingModel } from '@/types/booking-models';

/** Models C/D/E: event, class, or resource - use notification_settings + non-legacy cron paths. */
export function isCdeBookingModel(model: BookingModel | string | null | undefined): boolean {
  return model === 'event_ticket' || model === 'class_session' || model === 'resource_booking';
}

export function isCdeBookingRow(row: {
  experience_event_id?: string | null;
  class_instance_id?: string | null;
  resource_id?: string | null;
}): boolean {
  return Boolean(row.experience_event_id || row.class_instance_id || row.resource_id);
}
