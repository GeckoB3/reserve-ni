import { createHmac, timingSafeEqual } from 'crypto';
import { normalizePublicBaseUrl } from '@/lib/public-base-url';

/**
 * Secret for HMAC signing of payment links and manage-link tokens.
 * Must be set via PAYMENT_TOKEN_SECRET — never use STRIPE_SECRET_KEY or hardcoded fallbacks.
 */
export function getPaymentTokenSecret(): string {
  const secret = process.env.PAYMENT_TOKEN_SECRET?.trim();
  if (!secret) {
    throw new Error('PAYMENT_TOKEN_SECRET is required');
  }
  return secret;
}

export function tryGetPaymentTokenSecret(): string | null {
  const secret = process.env.PAYMENT_TOKEN_SECRET?.trim();
  return secret && secret.length > 0 ? secret : null;
}

/**
 * Compact signed payment token (24h expiry).
 * Format: base64url(16-byte uuid + 4-byte unix expiry seconds).12-char HMAC
 * — much shorter than legacy `uuid:ms` string encoding for SMS.
 */
export function createPaymentLinkToken(bookingId: string): string {
  const secret = getPaymentTokenSecret();
  const hex = bookingId.replace(/-/g, '');
  const idBytes = Buffer.from(hex, 'hex');
  if (idBytes.length !== 16) {
    throw new Error('Invalid booking id for payment token');
  }
  const expSec = Math.floor(Date.now() / 1000) + 24 * 60 * 60;
  const expBuf = Buffer.alloc(4);
  expBuf.writeUInt32BE(expSec, 0);
  const body = Buffer.concat([idBytes, expBuf]);
  const sig = createHmac('sha256', secret).update(body).digest('base64url').slice(0, 12);
  return `${body.toString('base64url')}.${sig}`;
}

/**
 * Guest-facing pay URL with a short path (`/p/...`) so SMS stays in one GSM segment where possible.
 */
export function createPaymentPageUrl(bookingId: string, publicOrigin?: string): string {
  const baseUrl = publicOrigin
    ? normalizePublicBaseUrl(publicOrigin)
    : normalizePublicBaseUrl(process.env.NEXT_PUBLIC_BASE_URL);
  const token = createPaymentLinkToken(bookingId);
  return `${baseUrl}/p/${token}`;
}

export type VerifyPaymentLinkTokenResult =
  | { ok: true; bookingId: string; exp: number }
  | { ok: false; reason: 'invalid' | 'misconfigured' };

export function verifyPaymentLinkToken(token: string): VerifyPaymentLinkTokenResult {
  const secret = tryGetPaymentTokenSecret();
  if (!secret) {
    return { ok: false, reason: 'misconfigured' };
  }

  const parts = token.trim().split('.');
  if (parts.length !== 2) {
    return { ok: false, reason: 'invalid' };
  }

  let payloadBuf: Buffer;
  try {
    payloadBuf = Buffer.from(parts[0]!, 'base64url');
  } catch {
    return { ok: false, reason: 'invalid' };
  }

  const receivedSig = parts[1]!;

  if (payloadBuf.length === 20) {
    const idBytes = payloadBuf.subarray(0, 16);
    const expSec = payloadBuf.readUInt32BE(16);
    const expectedSig = createHmac('sha256', secret).update(payloadBuf).digest('base64url').slice(0, 12);
    if (expectedSig.length !== receivedSig.length) {
      return { ok: false, reason: 'invalid' };
    }
    try {
      if (!timingSafeEqual(Buffer.from(expectedSig), Buffer.from(receivedSig))) {
        return { ok: false, reason: 'invalid' };
      }
    } catch {
      return { ok: false, reason: 'invalid' };
    }
    const hex = idBytes.toString('hex');
    const bookingId = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    const expMs = expSec * 1000;
    if (!Number.isFinite(expMs)) {
      return { ok: false, reason: 'invalid' };
    }
    return { ok: true, bookingId, exp: expMs };
  }

  let payload: string;
  try {
    payload = payloadBuf.toString('utf8');
  } catch {
    return { ok: false, reason: 'invalid' };
  }

  const expectedSig = createHmac('sha256', secret).update(payload).digest('base64url');
  if (expectedSig.length !== receivedSig.length) {
    return { ok: false, reason: 'invalid' };
  }
  try {
    if (!timingSafeEqual(Buffer.from(expectedSig), Buffer.from(receivedSig))) {
      return { ok: false, reason: 'invalid' };
    }
  } catch {
    return { ok: false, reason: 'invalid' };
  }

  const colon = payload.indexOf(':');
  if (colon < 1) {
    return { ok: false, reason: 'invalid' };
  }

  const bookingId = payload.slice(0, colon);
  const exp = parseInt(payload.slice(colon + 1), 10);
  if (!bookingId || !Number.isFinite(exp)) {
    return { ok: false, reason: 'invalid' };
  }

  return { ok: true, bookingId, exp };
}
