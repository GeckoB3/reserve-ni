'use client';

import { createBrowserClient } from '@supabase/ssr';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect } from 'react';
import { hasPlatformSuperuserJwtRole } from '@/lib/platform-auth';
import { sanitizeAuthNextPath } from '@/lib/safe-auth-redirect';

/**
 * Email invite / magic-link flows must exchange the auth code in the **browser**.
 * A Route Handler cannot reliably complete PKCE: the code verifier cookie is tied to the
 * browser session when the user follows the link from email, not to the server callback request.
 *
 * @see https://supabase.com/docs/guides/auth/server-side/nextjs
 */
function AuthCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    async function run() {
      const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      );

      async function redirectAfterSession() {
        let destination = sanitizeAuthNextPath(searchParams.get('next'));
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user && hasPlatformSuperuserJwtRole(user)) {
          const pathOnly = destination.split('?')[0] ?? '';
          if (pathOnly !== '/super' && !pathOnly.startsWith('/super/')) {
            destination = '/super';
          }
        }
        router.replace(destination);
        router.refresh();
      }

      const oauthError = searchParams.get('error');
      const oauthDesc = (searchParams.get('error_description') ?? '').toLowerCase();
      if (oauthError) {
        const isOtp =
          oauthDesc.includes('expired') ||
          oauthDesc.includes('invalid') ||
          oauthError === 'access_denied';
        router.replace(`/login?error=auth_callback_error&detail=${isOtp ? 'otp_expired' : 'exchange_failed'}`);
        return;
      }

      const {
        data: { session: existingSession },
      } = await supabase.auth.getSession();
      if (existingSession) {
        await redirectAfterSession();
        return;
      }

      let code = searchParams.get('code');
      if (!code && typeof window !== 'undefined') {
        const hash = window.location.hash?.replace(/^#/, '');
        if (hash) {
          code = new URLSearchParams(hash).get('code');
        }
      }

      if (!code) {
        router.replace('/login?error=auth_callback_error&detail=exchange_failed');
        return;
      }

      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) {
        const msg = (error.message ?? '').toLowerCase();
        const isOtp =
          msg.includes('expired') ||
          msg.includes('invalid') ||
          msg.includes('already been used') ||
          msg.includes('code verifier') ||
          msg.includes('bad code');
        const detail = isOtp ? 'otp_expired' : 'exchange_failed';
        console.error('[auth/callback] exchangeCodeForSession:', error.message);
        router.replace(`/login?error=auth_callback_error&detail=${detail}`);
        return;
      }

      await redirectAfterSession();
    }

    void run();
  }, [router, searchParams]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-slate-50 p-4">
      <div
        className="h-8 w-8 animate-spin rounded-full border-4 border-brand-200 border-t-brand-600"
        aria-hidden
      />
      <p className="text-sm text-slate-600">Signing you in…</p>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-slate-50">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-200 border-t-brand-600" />
        </div>
      }
    >
      <AuthCallbackContent />
    </Suspense>
  );
}
