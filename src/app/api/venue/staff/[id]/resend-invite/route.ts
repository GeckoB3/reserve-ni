import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getVenueStaff, requireAdmin } from '@/lib/venue-auth';
import { getSupabaseAdminClient } from '@/lib/supabase';
import { sendEmail } from '@/lib/emails/send-email';
import { getStaffInviteRedirectTo } from '@/lib/staff-invite-redirect';

/**
 * POST /api/venue/staff/[id]/resend-invite — admin only.
 * Sends a new access link (same flow as onboarding / Add user: callback → set-password → dashboard).
 * Tries Supabase invite email first; if the account already exists, falls back to a magic link emailed via SendGrid.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const supabase = await createClient();
    const staffCtx = await getVenueStaff(supabase);
    if (!staffCtx) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    if (!requireAdmin(staffCtx)) {
      return NextResponse.json({ error: 'Forbidden: admin only' }, { status: 403 });
    }

    const { id } = await params;
    const admin = getSupabaseAdminClient();

    const { data: target, error: targetErr } = await admin
      .from('staff')
      .select('id, email, venue_id')
      .eq('id', id)
      .eq('venue_id', staffCtx.venue_id)
      .single();

    if (targetErr || !target) {
      return NextResponse.json({ error: 'Staff member not found' }, { status: 404 });
    }

    const email = (target.email as string).trim().toLowerCase();
    const redirectTo = getStaffInviteRedirectTo(request);

    const { data: venueRow } = await admin
      .from('venues')
      .select('name')
      .eq('id', staffCtx.venue_id)
      .single();
    const venueName = venueRow?.name?.trim() || 'your venue';

    const userMetadata = { venue_id: staffCtx.venue_id };

    const { error: inviteErr } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo,
      data: userMetadata,
    });

    if (!inviteErr) {
      return NextResponse.json({
        ok: true,
        message: 'A new invitation email was sent.',
        channel: 'supabase',
      });
    }

    const errMsg = inviteErr.message?.toLowerCase() ?? '';
    const canTryMagicLink =
      errMsg.includes('already') ||
      errMsg.includes('registered') ||
      errMsg.includes('exists') ||
      errMsg.includes('duplicate');

    if (!canTryMagicLink) {
      console.error('[resend-invite] inviteUserByEmail:', inviteErr);
      return NextResponse.json({ error: inviteErr.message ?? 'Failed to send invite' }, { status: 500 });
    }

    const { data: genData, error: linkErr } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email,
      options: {
        redirectTo,
        data: userMetadata,
      },
    });

    const actionLink =
      (genData as { properties?: { action_link?: string } } | null)?.properties?.action_link ?? '';

    if (linkErr || !actionLink) {
      console.error('[resend-invite] generateLink:', linkErr);
      return NextResponse.json(
        {
          error:
            'Could not generate a sign-in link. The user may need to use Forgot password on the login page, or contact support.',
        },
        { status: 500 },
      );
    }

    const subject = `Sign in to ${venueName} — Reserve NI`;
    const text = [
      `You were invited to access the dashboard for ${venueName}.`,
      '',
      `Open this link to sign in and set or confirm your password:`,
      actionLink,
      '',
      'If you did not expect this email, you can ignore it.',
    ].join('\n');

    const html = `
      <p>You were invited to access the dashboard for <strong>${escapeHtml(venueName)}</strong>.</p>
      <p><a href="${escapeHtml(actionLink)}">Sign in and continue</a></p>
      <p style="font-size:12px;color:#64748b;">If you did not expect this email, you can ignore it.</p>
    `;

    const messageId = await sendEmail({ to: email, subject, html, text });

    if (!messageId) {
      return NextResponse.json(
        {
          error:
            'Could not email the sign-in link. Configure SENDGRID_API_KEY and SENDGRID_FROM_EMAIL, or ask the team member to use Forgot password on the login page.',
        },
        { status: 503 },
      );
    }

    return NextResponse.json({
      ok: true,
      message: 'A new sign-in link was emailed to them.',
      channel: 'sendgrid',
    });
  } catch (err) {
    console.error('POST /api/venue/staff/[id]/resend-invite failed:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
