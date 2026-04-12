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
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const next = sanitizeAuthNextPath(searchParams.get('next'));
  const base = getBaseUrl(request.url);

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
  }

  return NextResponse.redirect(`${base}/login?error=auth_callback_error`);
}
