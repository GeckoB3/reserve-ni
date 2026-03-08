import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * GET /auth/confirm — handle PKCE magic link and email confirmation.
 *
 * Supabase's default email template sends links to:
 *   {{ .SiteURL }}/auth/confirm?token_hash=xxx&type=magiclink
 *
 * This route verifies the token and redirects to the dashboard.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type') as
    | 'signup'
    | 'invite'
    | 'magiclink'
    | 'recovery'
    | 'email_change'
    | null;
  const next = searchParams.get('next') ?? '/dashboard';

  if (tokenHash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
    console.error('Auth confirm failed:', error.message);
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback_error`);
}
