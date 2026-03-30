import { createHmac, timingSafeEqual } from 'crypto';

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

/** Signed token: base64url(bookingId:exp).hmac — 24h expiry. */
export function createPaymentLinkToken(bookingId: string): string {
  const secret = getPaymentTokenSecret();
  const exp = Date.now() + 24 * 60 * 60 * 1000;
  const payload = `${bookingId}:${exp}`;
  const sig = createHmac('sha256', secret).update(payload).digest('base64url');
  return Buffer.from(payload).toString('base64url') + '.' + sig;
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

  let payload: string;
  try {
    payload = Buffer.from(parts[0]!, 'base64url').toString('utf8');
  } catch {
    return { ok: false, reason: 'invalid' };
  }

  const expectedSig = createHmac('sha256', secret).update(payload).digest('base64url');
  const received = parts[1]!;

  if (expectedSig.length !== received.length) {
    return { ok: false, reason: 'invalid' };
  }

  try {
    if (!timingSafeEqual(Buffer.from(expectedSig), Buffer.from(received))) {
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
