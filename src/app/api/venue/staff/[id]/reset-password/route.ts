import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getVenueStaff, requireAdmin } from '@/lib/venue-auth';
import { getSupabaseAdminClient } from '@/lib/supabase';
import { z } from 'zod';

const schema = z.object({
  new_password: z.string().min(8, 'Password must be at least 8 characters'),
});

/** POST /api/venue/staff/[id]/reset-password - admin resets another user's password. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const supabase = await createClient();
    const staff = await getVenueStaff(supabase);
    if (!staff) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    if (!requireAdmin(staff)) return NextResponse.json({ error: 'Forbidden: admin only' }, { status: 403 });

    const { id } = await params;
    const body = await request.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 });
    }

    const admin = getSupabaseAdminClient();

    // Find the staff member
    const { data: target } = await admin
      .from('staff')
      .select('id, email, venue_id')
      .eq('id', id)
      .eq('venue_id', staff.venue_id)
      .single();

    if (!target) return NextResponse.json({ error: 'Staff member not found' }, { status: 404 });

    // Find the auth user by email
    const { data: authUsers } = await admin.auth.admin.listUsers();
    const authUser = authUsers?.users?.find(
      (u) => u.email?.toLowerCase() === target.email.toLowerCase(),
    );

    if (!authUser) {
      return NextResponse.json({ error: 'Auth account not found for this staff member' }, { status: 404 });
    }

    const { error: updateErr } = await admin.auth.admin.updateUserById(authUser.id, {
      password: parsed.data.new_password,
    });

    if (updateErr) {
      console.error('Admin password reset failed:', updateErr);
      return NextResponse.json({ error: 'Password reset failed: ' + updateErr.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('POST /api/venue/staff/[id]/reset-password failed:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
