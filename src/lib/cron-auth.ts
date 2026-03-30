import { NextRequest, NextResponse } from 'next/server';

/**
 * Cron routes must not run unauthenticated in production.
 * - Production: CRON_SECRET is required; caller must send Authorization: Bearer <secret>.
 * - Non-production: if CRON_SECRET is set, same check applies; if unset, allow (local dev).
 */
export function requireCronAuthorisation(request: NextRequest): NextResponse | null {
  const secret = process.env.CRON_SECRET?.trim();
  const isProd = process.env.NODE_ENV === 'production';

  if (isProd && !secret) {
    console.error('[cron] CRON_SECRET must be set in production');
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  }

  if (secret) {
    if (request.headers.get('authorization') !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    }
  }

  return null;
}
