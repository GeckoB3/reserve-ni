import { createClient } from '@/lib/supabase/server';
import { isPlatformSuperuser } from '@/lib/platform-auth';
import { sanitizeAuthNextPath } from '@/lib/safe-auth-redirect';
import { NextResponse } from 'next/server';

function getBaseUrl(requestUrl: string): string {
  if (process.env.NEXT_PUBLIC_BASE_URL) return process.env.NEXT_PUBLIC_BASE_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return new URL(requestUrl).origin;
}

/**
 * Supabase Auth callback for magic link (and OAuth). Exchange code for session and redirect.
 */
function callbackFailureRedirect(base: string, reason: 'otp_expired' | 'exchange_failed'): NextResponse {
  const detail = reason === 'otp_expired' ? 'otp_expired' : 'exchange_failed';
  return NextResponse.redirect(`${base}/login?error=auth_callback_error&detail=${detail}`);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const next = sanitizeAuthNextPath(searchParams.get('next'));
  const base = getBaseUrl(request.url);

  const oauthError = searchParams.get('error');
  const oauthDesc = (searchParams.get('error_description') ?? '').toLowerCase();
  if (oauthError) {
    if (
      oauthDesc.includes('expired') ||
      oauthDesc.includes('invalid') ||
      oauthError === 'access_denied'
    ) {
      return callbackFailureRedirect(base, 'otp_expired');
    }
    return callbackFailureRedirect(base, 'exchange_failed');
  }

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const { data: { user } } = await supabase.auth.getUser();
      let destination = next;
      if (user && isPlatformSuperuser(user)) {
        const pathOnly = next.split('?')[0] ?? '';
        if (pathOnly !== '/super' && !pathOnly.startsWith('/super/')) {
          destination = '/super';
        }
      }
      return NextResponse.redirect(`${base}${destination}`);
    }

    const msg = (error.message ?? '').toLowerCase();
    if (
      msg.includes('expired') ||
      msg.includes('invalid') ||
      msg.includes('already been used') ||
      msg.includes('code verifier') ||
      msg.includes('bad code')
    ) {
      return callbackFailureRedirect(base, 'otp_expired');
    }
    console.error('[auth/callback] exchangeCodeForSession:', error.message);
    return callbackFailureRedirect(base, 'exchange_failed');
  }

  return callbackFailureRedirect(base, 'exchange_failed');
}
