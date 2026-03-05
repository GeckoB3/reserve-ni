import { createHmac } from 'crypto';

const SECRET = () => process.env.PAYMENT_TOKEN_SECRET || process.env.STRIPE_SECRET_KEY || 'dev-secret';

/**
 * Create a compact signed manage link for a booking.
 * Format: /m/[base64url(uuid_bytes)].[hmac_12chars]
 * Total URL length: ~55 characters.
 */
export function createShortManageLink(bookingId: string): string {
  const hex = bookingId.replace(/-/g, '');
  const payload = Buffer.from(hex, 'hex').toString('base64url');
  const sig = createHmac('sha256', SECRET()).update(payload).digest('base64url').slice(0, 12);
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://reserveni.com';
  return `${baseUrl}/m/${payload}.${sig}`;
}
