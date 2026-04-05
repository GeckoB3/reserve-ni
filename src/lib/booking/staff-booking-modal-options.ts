import type { BookingModel } from '@/types/booking-models';
import { isUnifiedSchedulingVenue } from '@/lib/booking/unified-scheduling';

export type StaffBookingExtraTab = 'none' | 'event' | 'class' | 'resource';

export interface StaffBookingSecondaryOption {
  value: Exclude<StaffBookingExtraTab, 'none'>;
  label: string;
}

/**
 * Secondary booking types (events / classes / resources) when the venue primary is something else.
 * Matches {@link NewBookingPageClient} / public booking tab ordering.
 */
export function staffSecondaryBookingOptions(
  bookingModel: BookingModel,
  enabledModels: BookingModel[],
): StaffBookingSecondaryOption[] {
  const canStaffEventBooking = bookingModel === 'event_ticket' || enabledModels.includes('event_ticket');
  const canStaffClassBooking = bookingModel === 'class_session' || enabledModels.includes('class_session');
  const canStaffResourceBooking = bookingModel === 'resource_booking' || enabledModels.includes('resource_booking');

  const opts: StaffBookingSecondaryOption[] = [];
  if (canStaffEventBooking && bookingModel !== 'event_ticket') {
    opts.push({ value: 'event', label: 'Event tickets' });
  }
  if (canStaffClassBooking && bookingModel !== 'class_session') {
    opts.push({ value: 'class', label: 'Classes' });
  }
  if (canStaffResourceBooking && bookingModel !== 'resource_booking') {
    opts.push({ value: 'resource', label: 'Resources' });
  }
  return opts;
}

/** Label for the primary (native) booking type in staff selectors. */
export function primaryStaffBookingLabel(bookingModel: BookingModel): string {
  if (isUnifiedSchedulingVenue(bookingModel)) return 'Appointment';
  if (bookingModel === 'class_session') return 'Classes';
  if (bookingModel === 'resource_booking') return 'Resources';
  if (bookingModel === 'event_ticket') return 'Event tickets';
  return 'Table reservation';
}

export function isAppointmentPrimaryBooking(bookingModel: BookingModel): boolean {
  return isUnifiedSchedulingVenue(bookingModel);
}
