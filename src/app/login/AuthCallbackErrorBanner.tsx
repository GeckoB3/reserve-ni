'use client';

import { useLayoutEffect, useState } from 'react';

const OTP_EXPIRED_MSG =
  'This sign-in link was already used or has expired. Please request a new link.';

const EXCHANGE_FAILED_MSG =
  'We could not complete sign-in from that link. Use the latest link from your email, request a new sign-in link, or sign in with your password if you have one.';

const GENERIC_MSG =
  'This sign-in link is invalid or has expired. Please request a new link or sign in with your password.';

/**
 * Supabase often redirects here with `?error=auth_callback_error&detail=otp_expired` after a failed PKCE exchange.
 * Older URLs may carry `#error_code=otp_expired` in the fragment (not visible to the server); we read it on the client.
 */
export function AuthCallbackErrorBanner({
  error,
  detail,
}: {
  error?: string;
  detail?: string;
}) {
  const [hashDetail, setHashDetail] = useState<string | null>(null);

  useLayoutEffect(() => {
    if (typeof window === 'undefined') return;
    const raw = window.location.hash?.replace(/^#/, '');
    if (!raw) return;
    const p = new URLSearchParams(raw);
    const code = p.get('error_code');
    let next: string | null = null;
    if (code === 'otp_expired') next = 'otp_expired';
    else if (p.get('error')) next = 'exchange_failed';
    if (next) {
      queueMicrotask(() => setHashDetail(next));
    }
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }, []);

  if (error !== 'auth_callback_error') {
    return null;
  }

  const effective = detail ?? hashDetail;
  let body: string;
  if (effective === 'otp_expired') {
    body = OTP_EXPIRED_MSG;
  } else if (effective === 'exchange_failed') {
    body = EXCHANGE_FAILED_MSG;
  } else {
    body = GENERIC_MSG;
  }

  return (
    <p className="mt-4 rounded-lg border border-red-100 bg-red-50 px-3 py-2.5 text-center text-sm text-red-700">{body}</p>
  );
}
