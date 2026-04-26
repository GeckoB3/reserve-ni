import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { isPlatformSuperuser } from '@/lib/platform-auth';
import { endSupportSession, extendSupportSession } from '@/lib/support-session-core';
import { clearSupportSessionCookie, getSupportSessionCookieIdFromCookies, setSupportSessionCookie } from '@/lib/support-session-server';

const patchBodySchema = z.object({ action: z.literal('extend') });

/** PATCH /api/platform/support-sessions/current — extend active support session (superuser only). */
export async function PATCH(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user || !isPlatformSuperuser(user)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const sessionId = await getSupportSessionCookieIdFromCookies();
    if (!sessionId) {
      return NextResponse.json({ error: 'No active support session' }, { status: 400 });
    }

    const json = await request.json().catch(() => null);
    const parsed = patchBodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
    }

    const result = await extendSupportSession({ sessionId, superuserId: user.id });
    if (!result.ok || !result.session) {
      return NextResponse.json({ error: result.error ?? 'Failed to extend' }, { status: 400 });
    }
    await setSupportSessionCookie(result.session.id);
    return NextResponse.json({
      expires_at: result.session.expires_at,
    });
  } catch (err) {
    console.error('[platform/support-sessions/current] PATCH:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/** DELETE /api/platform/support-sessions/current — end session (superuser only). */
export async function DELETE() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user || !isPlatformSuperuser(user)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const sessionId = await getSupportSessionCookieIdFromCookies();
    if (!sessionId) {
      await clearSupportSessionCookie();
      return NextResponse.json({ ok: true });
    }

    await endSupportSession({ sessionId, superuserId: user.id });
    await clearSupportSessionCookie();
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[platform/support-sessions/current] DELETE:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
