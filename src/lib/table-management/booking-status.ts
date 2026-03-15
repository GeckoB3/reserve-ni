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
  Seated: ['Completed', 'Cancelled', 'Confirmed'],
  Completed: ['Seated'],
  'No-Show': ['Confirmed'],
  Cancelled: [],
};

export const BOOKING_PRIMARY_ACTIONS: Partial<Record<BookingStatus, { label: string; target: BookingStatus }>> = {
  Pending: { label: 'Confirm', target: 'Confirmed' },
  Confirmed: { label: 'Seat', target: 'Seated' },
  Seated: { label: 'Complete', target: 'Completed' },
};

export const BOOKING_REVERT_ACTIONS: Partial<Record<BookingStatus, { label: string; target: BookingStatus }>> = {
  Seated: { label: 'Unseat', target: 'Confirmed' },
  Completed: { label: 'Reopen', target: 'Seated' },
  'No-Show': { label: 'Revert No-Show', target: 'Confirmed' },
};

export function isRevertTransition(from: BookingStatus | string, to: BookingStatus | string): boolean {
  if (!isBookingStatus(from) || !isBookingStatus(to)) return false;
  return BOOKING_REVERT_ACTIONS[from]?.target === to;
}

export const BOOKING_DESTRUCTIVE_STATUSES: BookingStatus[] = ['No-Show', 'Cancelled', 'Completed'];

export function isBookingStatus(value: string): value is BookingStatus {
  return (BOOKING_STATUSES as readonly string[]).includes(value);
}

export function canTransitionBookingStatus(
  fromStatus: BookingStatus | string,
  toStatus: BookingStatus | string
): boolean {
  if (!isBookingStatus(fromStatus) || !isBookingStatus(toStatus)) return false;
  return BOOKING_STATUS_TRANSITIONS[fromStatus].includes(toStatus);
}

export function isDestructiveBookingStatus(status: BookingStatus | string): boolean {
  return isBookingStatus(status) && BOOKING_DESTRUCTIVE_STATUSES.includes(status);
}

export function canMarkNoShowForSlot(
  bookingDate: string,
  bookingTime: string,
  graceMinutes: number,
  nowDate = new Date(),
): boolean {
  const today = nowDate.toISOString().slice(0, 10);
  if (bookingDate < today) return true;
  if (bookingDate > today) return false;
  const [hours, minutes] = bookingTime.slice(0, 5).split(':').map(Number);
  const bookingMin = (hours ?? 0) * 60 + (minutes ?? 0);
  const nowMin = nowDate.getHours() * 60 + nowDate.getMinutes();
  return nowMin >= bookingMin + graceMinutes;
}
