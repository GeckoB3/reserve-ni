import { randomUUID } from 'crypto';

/**
 * One UUID shared by every `bookings` row created in the same checkout (plan §7.4).
 * Used by `/api/booking/create-multi-service` and `/api/booking/create-group`.
 */
export function generateGroupBookingId(): string {
  return randomUUID();
}
