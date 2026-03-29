import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getVenueStaff, requireAdmin } from '@/lib/venue-auth';
import { getSupabaseAdminClient } from '@/lib/supabase';
import { z } from 'zod';

const inviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(['admin', 'staff']),
});

/** POST /api/venue/staff/invite — invite staff by email (admin only). Sends Supabase magic link. */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const staff = await getVenueStaff(supabase);
    if (!staff) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    }
    if (!requireAdmin(staff)) {
      return NextResponse.json({ error: 'Forbidden: admin only' }, { status: 403 });
    }

    const body = await request.json();
    const parsed = inviteSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { email, role } = parsed.data;
    const normalisedEmail = email.trim().toLowerCase();

    const { data: existing } = await staff.db
      .from('staff')
      .select('id')
      .eq('venue_id', staff.venue_id)
      .eq('email', normalisedEmail)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ error: 'This email is already a staff member for this venue' }, { status: 409 });
    }

    const admin = getSupabaseAdminClient();
    const redirectTo = (process.env.NEXT_PUBLIC_BASE_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : request.nextUrl.origin)) + '/dashboard';
    const { error: inviteError } = await admin.auth.admin.inviteUserByEmail(normalisedEmail, {
      redirectTo,
      data: { venue_id: staff.venue_id },
    });

    if (inviteError) {
      if (inviteError.message?.toLowerCase().includes('already been invited') || inviteError.message?.toLowerCase().includes('already exists')) {
        // User may already exist in Auth; still add to staff
      } else {
        console.error('inviteUserByEmail failed:', inviteError);
        return NextResponse.json({ error: 'Failed to send invite: ' + inviteError.message }, { status: 500 });
      }
    }

    const { data: newStaff, error: insertError } = await staff.db
      .from('staff')
      .insert({
        venue_id: staff.venue_id,
        email: normalisedEmail,
        role,
      })
      .select('id, email, role, created_at')
      .single();

    if (insertError) {
      console.error('staff insert failed:', insertError);
      return NextResponse.json({ error: 'Failed to add staff member' }, { status: 500 });
    }

    return NextResponse.json({
      message: 'Invite sent',
      staff: newStaff,
    }, { status: 201 });
  } catch (err) {
    console.error('POST /api/venue/staff/invite failed:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
