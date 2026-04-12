import type { NextRequest } from 'next/server';

/**
 * Public site URL for auth redirects. Prefer NEXT_PUBLIC_BASE_URL in production so it matches
 * Supabase Dashboard → Authentication → URL Configuration (Site URL + Redirect URLs must allow
 * `${base}/auth/callback` and `${base}/auth/**`).
 */
export function getStaffAuthBaseUrl(request: NextRequest | Request): string {
  return (
    process.env.NEXT_PUBLIC_BASE_URL?.replace(/\/$/, '') ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : new URL(request.url).origin.replace(/\/$/, ''))
  );
}

/**
 * After the user clicks the link in their email, Supabase redirects here with a `code` query param.
 * `/auth/callback` exchanges the code for a session, then sends the user to `/auth/set-password`
 * to choose a password before opening the dashboard.
 */
export function getStaffInviteRedirectTo(request: NextRequest | Request): string {
  const base = getStaffAuthBaseUrl(request);
  return `${base}/auth/callback?next=${encodeURIComponent('/auth/set-password')}`;
}
