import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

function getBaseUrl(requestUrl: string): string {
  if (process.env.NEXT_PUBLIC_BASE_URL) return process.env.NEXT_PUBLIC_BASE_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return new URL(requestUrl).origin;
}

/**
 * GET /auth/confirm - handle PKCE magic link and email confirmation.
 *
 * Supabase's email template sends links to:
 *   {{ .SiteURL }}/auth/confirm?token_hash=xxx&type=magiclink
 *
 * This route verifies the token and redirects to the dashboard.
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
  const next = searchParams.get('next') ?? '/dashboard';
  const base = getBaseUrl(request.url);

  if (tokenHash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (!error) {
      return NextResponse.redirect(`${base}${next}`);
    }
    console.error('Auth confirm failed:', error.message);
  }

  return NextResponse.redirect(`${base}/login?error=auth_callback_error`);
}
