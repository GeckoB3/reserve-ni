import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getVenueStaff, requireAdmin } from '@/lib/venue-auth';
import { getSupabaseAdminClient } from '@/lib/supabase';
import { z } from 'zod';

const createSchema = z.object({
  email: z.string().email('Valid email required'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  name: z.string().max(200).optional(),
  role: z.enum(['admin', 'staff']),
});

/** POST /api/venue/staff/create — admin creates a new staff user with email and password. */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const staff = await getVenueStaff(supabase);
    if (!staff) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    if (!requireAdmin(staff)) return NextResponse.json({ error: 'Forbidden: admin only' }, { status: 403 });

    const body = await request.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid request', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { email, password, name, role } = parsed.data;
    const normalisedEmail = email.trim().toLowerCase();

    const admin = getSupabaseAdminClient();

    // Check if already a staff member at this venue
    const { data: existing } = await admin
      .from('staff')
      .select('id')
      .eq('venue_id', staff.venue_id)
      .eq('email', normalisedEmail)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ error: 'This email is already a staff member at this venue' }, { status: 409 });
    }

    // Create the Supabase Auth user (or link to existing)
    let authUserId: string | null = null;

    // Check if auth user already exists
    const { data: existingUsers } = await admin.auth.admin.listUsers();
    const existingAuthUser = existingUsers?.users?.find(
      (u) => u.email?.toLowerCase() === normalisedEmail,
    );

    if (existingAuthUser) {
      authUserId = existingAuthUser.id;
      // Update password for existing user
      await admin.auth.admin.updateUserById(authUserId, { password });
    } else {
      const { data: newUser, error: createErr } = await admin.auth.admin.createUser({
        email: normalisedEmail,
        password,
        email_confirm: true,
        user_metadata: { venue_id: staff.venue_id },
      });

      if (createErr) {
        console.error('Auth user creation failed:', createErr);
        return NextResponse.json({ error: 'Failed to create user account: ' + createErr.message }, { status: 500 });
      }
      authUserId = newUser.user.id;
    }

    // Insert into staff table
    const { data: newStaff, error: insertErr } = await admin
      .from('staff')
      .insert({
        venue_id: staff.venue_id,
        email: normalisedEmail,
        name: name?.trim() || null,
        role,
      })
      .select('id, email, name, role, created_at')
      .single();

    if (insertErr) {
      console.error('Staff insert failed:', insertErr);
      return NextResponse.json({ error: 'Failed to add staff member' }, { status: 500 });
    }

    return NextResponse.json({ staff: newStaff }, { status: 201 });
  } catch (err) {
    console.error('POST /api/venue/staff/create failed:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
