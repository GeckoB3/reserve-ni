import { createHmac, timingSafeEqual } from 'crypto';
import { getPaymentTokenSecret, tryGetPaymentTokenSecret } from '@/lib/payment-token';

/**
 * Create a compact signed manage link for a booking.
 * Format: /m/[base64url(uuid_bytes)].[hmac_12chars]
 * Total URL length: ~55 characters.
 */
export function createShortManageLink(bookingId: string): string {
  const hex = bookingId.replace(/-/g, '');
  const payload = Buffer.from(hex, 'hex').toString('base64url');
  const sig = createHmac('sha256', getPaymentTokenSecret())
    .update(payload)
    .digest('base64url')
    .slice(0, 12);
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://www.reserveni.com';
  return `${baseUrl}/m/${payload}.${sig}`;
}

/**
 * Generate an HMAC signature for a booking ID (used as an alternative auth
 * mechanism that doesn't require storing/overwriting a hash in the DB).
 */
export function createBookingHmac(bookingId: string): string {
  return createHmac('sha256', getPaymentTokenSecret())
    .update(`manage:${bookingId}`)
    .digest('base64url');
}

/**
 * Verify an HMAC signature for a booking ID.
 */
export function verifyBookingHmac(bookingId: string, hmac: string): boolean {
  const secret = tryGetPaymentTokenSecret();
  if (!secret) return false;
  const expected = createHmac('sha256', secret)
    .update(`manage:${bookingId}`)
    .digest('base64url');
  if (expected.length !== hmac.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(hmac));
}
