import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { z } from 'zod';

const schema = z.object({
  new_password: z.string().min(8, 'Password must be at least 8 characters'),
});

/** POST /api/venue/staff/change-password — change the currently logged-in user's password. */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

    const body = await request.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid request' },
        { status: 400 },
      );
    }

    const { error: updateErr } = await supabase.auth.updateUser({
      password: parsed.data.new_password,
    });

    if (updateErr) {
      console.error('Password update failed:', updateErr);
      if (updateErr.message?.includes('same_password')) {
        return NextResponse.json({ error: 'New password must be different from the current one' }, { status: 400 });
      }
      return NextResponse.json({ error: updateErr.message ?? 'Password update failed' }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('POST /api/venue/staff/change-password failed:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
