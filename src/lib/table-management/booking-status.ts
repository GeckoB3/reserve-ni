export const BOOKING_STATUSES = [
  'Pending',
  'Confirmed',
  'Seated',
  'Completed',
  'No-Show',
  'Cancelled',
] as const;

export type BookingStatus = (typeof BOOKING_STATUSES)[number];

export const BOOKING_STATUS_TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  Pending: ['Confirmed', 'Cancelled'],
  Confirmed: ['Seated', 'No-Show', 'Cancelled'],
  Seated: ['Completed', 'Cancelled'],
  Completed: [],
  'No-Show': [],
  Cancelled: [],
};

export function canTransitionBookingStatus(
  fromStatus: BookingStatus,
  toStatus: BookingStatus
): boolean {
  return BOOKING_STATUS_TRANSITIONS[fromStatus].includes(toStatus);
}
