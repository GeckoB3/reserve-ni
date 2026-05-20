import { NextResponse } from 'next/server';
import type { User } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { isPlatformSuperuser } from '@/lib/platform-auth';

export type PlatformSuperuserAuthSuccess = {
  user: User;
  supabase: Awaited<ReturnType<typeof createClient>>;
};

export type PlatformSuperuserAuthResult = PlatformSuperuserAuthSuccess | NextResponse;

export function isPlatformAuthFailure(
  result: PlatformSuperuserAuthResult,
): result is NextResponse {
  return result instanceof NextResponse;
}

/**
 * Defense-in-depth auth for /api/platform/* handlers.
 * Middleware also blocks unauthenticated and non-superuser callers.
 */
export async function requirePlatformSuperuserAuth(): Promise<PlatformSuperuserAuthResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  }
  if (!isPlatformSuperuser(user)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  return { user, supabase };
}
