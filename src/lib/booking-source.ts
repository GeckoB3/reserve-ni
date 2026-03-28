/**
 * Bookings created on the public site pay deposits at checkout; staff/phone
 * bookings may use a pay-by-link flow instead.
 */
export function isSelfServeBookingSource(source: string | null | undefined): boolean {
  return source === 'online' || source === 'widget' || source === 'booking_page';
}
