import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getVenueStaff, requireAdmin } from '@/lib/venue-auth';
import { getSupabaseAdminClient } from '@/lib/supabase';
import { resendStaffAccessLinkEmail } from '@/lib/staff-invite-email';
import { getStaffAuthBaseUrl } from '@/lib/staff-invite-redirect';

/**
 * POST /api/venue/staff/[id]/resend-invite — admin only.
 * Sends a sign-in link via generateLink → /auth/confirm (server-side OTP, no PKCE) with
 * inviteUserByEmail fallback. Flow: /auth/confirm → /auth/set-password → dashboard.
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

    const { data: venueRow } = await admin
      .from('venues')
      .select('name')
      .eq('id', staffCtx.venue_id)
      .single();
    const venueName = venueRow?.name?.trim() || 'your venue';

    const userMetadata: Record<string, unknown> = {
      venue_id: staffCtx.venue_id,
      has_set_password: false,
    };

    const result = await resendStaffAccessLinkEmail({
      admin,
      email,
      baseUrl: getStaffAuthBaseUrl(request),
      userMetadata,
      venueName,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({
      ok: true,
      message: 'A new sign-in link was emailed to them.',
      channel: result.channel,
    });
  } catch (err) {
    console.error('POST /api/venue/staff/[id]/resend-invite failed:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
