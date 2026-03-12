import type { BookingStatus } from '@/lib/table-management/booking-status';

export type TableOperationalStatus =
  | 'available'
  | 'booked'
  | 'pending'
  | 'seated'
  | 'held'
  | 'no_show';

interface BookingForTableStatus {
  id: string;
  status: BookingStatus | 'Arrived' | string;
  booking_time: string;
  estimated_end_time: string | null;
}

interface AssignmentForTableStatus {
  booking_id: string;
  table_id: string;
}

interface TableBlockForStatus {
  table_id: string;
  start_at: string;
  end_at: string;
}

function toMinutesFromIso(iso: string): number {
  const value = iso.includes('T') ? iso.split('T')[1] ?? '' : iso;
  const hhmm = value.slice(0, 5);
  const [h, m] = hhmm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

function getBookingWindow(booking: BookingForTableStatus): { start: number; end: number } {
  const start = toMinutesFromIso(booking.booking_time);
  const end = booking.estimated_end_time ? toMinutesFromIso(booking.estimated_end_time) : start + 90;
  return { start, end };
}

export function getTableStatus(
  tableId: string,
  dateTimeIso: string,
  bookings: BookingForTableStatus[],
  assignments: AssignmentForTableStatus[],
  blocks: TableBlockForStatus[]
): TableOperationalStatus {
  const currentMinutes = toMinutesFromIso(dateTimeIso);

  const hasBlock = blocks.some((block) => {
    if (block.table_id !== tableId) return false;
    const start = toMinutesFromIso(block.start_at);
    const end = toMinutesFromIso(block.end_at);
    return currentMinutes >= start && currentMinutes < end;
  });
  if (hasBlock) return 'held';

  const bookingIds = new Set(
    assignments.filter((assignment) => assignment.table_id === tableId).map((assignment) => assignment.booking_id)
  );
  if (bookingIds.size === 0) return 'available';

  const activeBooking = bookings.find((booking) => {
    if (!bookingIds.has(booking.id)) return false;
    const window = getBookingWindow(booking);
    return currentMinutes >= window.start && currentMinutes < window.end;
  });

  if (!activeBooking) return 'available';
  if (activeBooking.status === 'Seated' || activeBooking.status === 'Arrived') return 'seated';
  if (activeBooking.status === 'Pending') return 'pending';
  if (activeBooking.status === 'No-Show') return 'no_show';
  if (activeBooking.status === 'Confirmed') return 'booked';
  return 'available';
}
