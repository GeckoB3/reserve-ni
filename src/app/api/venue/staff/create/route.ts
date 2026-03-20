import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getVenueStaff, requireAdmin } from '@/lib/venue-auth';
import { getSupabaseAdminClient } from '@/lib/supabase';
import { sendEmail } from '@/lib/emails/send-email';
import { renderStaffWelcomeEmail } from '@/lib/emails/templates/staff-welcome-email';
import { z } from 'zod';

const createSchema = z
  .object({
    email: z.string().email('Valid email required'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    password_confirm: z.string().min(1, 'Please confirm the password'),
    name: z.string().max(200).optional(),
    role: z.enum(['admin', 'staff']),
  })
  .refine((d) => d.password === d.password_confirm, {
    message: 'Passwords do not match',
    path: ['password_confirm'],
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

    const { email, password, password_confirm: _passwordConfirm, name, role } = parsed.data;
    const normalisedEmail = email.trim().toLowerCase();

    const admin = getSupabaseAdminClient();

    const { data: venueRow } = await admin
      .from('venues')
      .select('name')
      .eq('id', staff.venue_id)
      .single();
    const venueName = venueRow?.name?.trim() || 'Your venue';

    const baseUrl =
      process.env.NEXT_PUBLIC_BASE_URL ||
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : request.nextUrl.origin);
    const loginUrl = `${baseUrl.replace(/\/$/, '')}/login`;

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
      // Ensure they can sign in with email/password without a separate confirmation step
      const { error: updateErr } = await admin.auth.admin.updateUserById(authUserId, {
        password,
        email_confirm: true,
      });
      if (updateErr) {
        console.error('Auth user update failed:', updateErr);
        return NextResponse.json(
          { error: 'Failed to set password for existing account: ' + updateErr.message },
          { status: 500 },
        );
      }
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

    const { html, text } = renderStaffWelcomeEmail({
      venueName,
      email: normalisedEmail,
      password,
      role,
      loginUrl,
    });

    let welcomeEmailSent = false;
    try {
      const messageId = await sendEmail({
        to: normalisedEmail,
        subject: `Your ${venueName} dashboard login — Reserve NI`,
        html,
        text,
      });
      welcomeEmailSent = messageId !== null;
      if (!welcomeEmailSent) {
        console.warn(
          '[POST /api/venue/staff/create] Welcome email not sent (SendGrid not configured or empty recipient).',
          { venueId: staff.venue_id, email: normalisedEmail },
        );
      }
    } catch (emailErr) {
      console.error('[POST /api/venue/staff/create] Welcome email failed:', emailErr, {
        venueId: staff.venue_id,
        email: normalisedEmail,
      });
    }

    return NextResponse.json({ staff: newStaff, welcome_email_sent: welcomeEmailSent }, { status: 201 });
  } catch (err) {
    console.error('POST /api/venue/staff/create failed:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
