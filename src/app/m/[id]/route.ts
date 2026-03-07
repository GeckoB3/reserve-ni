import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase';
import { generateConfirmToken, hashConfirmToken } from '@/lib/confirm-token';
import { createHmac } from 'crypto';

const SECRET = () => process.env.PAYMENT_TOKEN_SECRET || process.env.STRIPE_SECRET_KEY || 'dev-secret';

/**
 * Verify a signed short manage code: base64url(uuid_bytes).hmac_12chars
 */
function parseShortCode(code: string): string | null {
  const dotIdx = code.lastIndexOf('.');
  if (dotIdx < 1) return null;
  const payload = code.slice(0, dotIdx);
  const sig = code.slice(dotIdx + 1);

  const expected = createHmac('sha256', SECRET()).update(payload).digest('base64url').slice(0, 12);
  if (sig !== expected) return null;

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
 * GET /m/:signedCode — Generate a fresh manage token and redirect.
 * This allows short URLs in SMS without storing raw tokens in the DB.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: code } = await params;
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://www.reserveni.com';

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

  const token = generateConfirmToken();
  await supabase.from('bookings').update({
    confirm_token_hash: hashConfirmToken(token),
    confirm_token_used_at: null,
    updated_at: new Date().toISOString(),
  }).eq('id', booking.id);

  return NextResponse.redirect(`${baseUrl}/manage/${booking.id}/${encodeURIComponent(token)}`);
}
