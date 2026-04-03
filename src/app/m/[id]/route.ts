import { NextRequest, NextResponse } from 'next/server';
import { createHmac, timingSafeEqual } from 'crypto';
import { getSupabaseAdminClient } from '@/lib/supabase';
import { createBookingHmac } from '@/lib/short-manage-link';
import { tryGetPaymentTokenSecret } from '@/lib/payment-token';
import { resolvePublicSiteOriginFromRequest } from '@/lib/public-base-url';

function parseShortCode(code: string): string | null {
  const secret = tryGetPaymentTokenSecret();
  if (!secret) return null;

  const dotIdx = code.lastIndexOf('.');
  if (dotIdx < 1) return null;
  const payload = code.slice(0, dotIdx);
  const sig = code.slice(dotIdx + 1);

  const expectedFull = createHmac('sha256', secret).update(payload).digest('base64url');
  const expected = expectedFull.slice(0, 12);
  if (expected.length !== sig.length) return null;
  try {
    if (!timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) return null;
  } catch {
    return null;
  }

  try {
    const bytes = Buffer.from(payload, 'base64url');
    if (bytes.length !== 16) return null;
    const hex = bytes.toString('hex');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  } catch {
    return null;
  }
}

/**
 * GET /m/:signedCode - Verify the short-link HMAC and redirect to the manage
 * page using HMAC-based auth. This avoids overwriting the token hash in the
 * database (which would invalidate email manage links).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: code } = await params;
  const baseUrl = resolvePublicSiteOriginFromRequest(_request);

  const bookingId = parseShortCode(code);
  if (!bookingId) {
    return NextResponse.redirect(new URL('/', baseUrl));
  }

  const supabase = getSupabaseAdminClient();
  const { data: booking } = await supabase
    .from('bookings')
    .select('id, status')
    .eq('id', bookingId)
    .maybeSingle();

  if (!booking || booking.status === 'Cancelled') {
    return NextResponse.redirect(new URL('/', baseUrl));
  }

  const hmac = createBookingHmac(booking.id);
  return NextResponse.redirect(
    `${baseUrl}/manage/${booking.id}?hmac=${encodeURIComponent(hmac)}`
  );
}
