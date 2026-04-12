import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { sanitizeAuthNextPath } from '@/lib/safe-auth-redirect';

function getBaseUrl(requestUrl: string): string {
  if (process.env.NEXT_PUBLIC_BASE_URL) return process.env.NEXT_PUBLIC_BASE_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return new URL(requestUrl).origin;
}

/**
 * GET /auth/confirm - handle OTP / email links (token_hash + type).
 *
 * Supabase email templates may send:
 *   {{ .SiteURL }}/auth/confirm?token_hash=xxx&type=magiclink
 *
 * Staff invites from `/api/venue/staff/invite` use PKCE `/auth/callback?next=/auth/set-password` instead;
 * this route still handles invite/magiclink when templates point here without `next`.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type') as
    | 'signup'
    | 'invite'
    | 'magiclink'
    | 'recovery'
    | 'email_change'
    | null;
  const rawNext = searchParams.get('next');
  const nextPath =
    rawNext != null && rawNext !== ''
      ? sanitizeAuthNextPath(rawNext)
      : type === 'invite'
        ? '/auth/set-password'
        : sanitizeAuthNextPath(null);
  const base = getBaseUrl(request.url);

  if (tokenHash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (!error) {
      return NextResponse.redirect(`${base}${nextPath}`);
    }
    console.error('Auth confirm failed:', error.message);
  }

  return NextResponse.redirect(`${base}/login?error=auth_callback_error`);
}
