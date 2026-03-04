import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdminClient } from '@/lib/supabase';

/**
 * GET /api/debug-staff
 * Temporary diagnostic endpoint — remove after debugging.
 * Reports what the admin client sees when looking up staff for the current user.
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();

    if (authErr) {
      return NextResponse.json({ step: 'auth', error: authErr.message });
    }
    if (!user) {
      return NextResponse.json({ step: 'auth', error: 'No user session' });
    }

    const email = user.email ?? '';
    const normalised = email.toLowerCase().trim();

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'NOT SET';
    const hasServiceKey = !!process.env.SUPABASE_SERVICE_ROLE_KEY;
    const serviceKeyPrefix = process.env.SUPABASE_SERVICE_ROLE_KEY?.slice(0, 10) ?? 'NOT SET';

    let admin;
    try {
      admin = getSupabaseAdminClient();
    } catch (e) {
      return NextResponse.json({
        step: 'admin_client',
        error: e instanceof Error ? e.message : 'unknown',
        supabaseUrl: supabaseUrl.slice(0, 40),
        hasServiceKey,
      });
    }

    const { data: allStaff, error: allErr } = await admin
      .from('staff')
      .select('id, email, venue_id, role')
      .limit(10);

    const { data: matchedStaff, error: matchErr } = await admin
      .from('staff')
      .select('id, email, venue_id, role')
      .ilike('email', normalised)
      .limit(5);

    return NextResponse.json({
      auth_user_email: email,
      normalised_email: normalised,
      supabase_url: supabaseUrl.slice(0, 40),
      has_service_role_key: hasServiceKey,
      service_key_prefix: serviceKeyPrefix,
      all_staff: {
        count: allStaff?.length ?? 0,
        error: allErr?.message ?? null,
        rows: allStaff?.map((s) => ({ email: s.email, venue_id: s.venue_id, role: s.role })) ?? [],
      },
      matched_staff: {
        count: matchedStaff?.length ?? 0,
        error: matchErr?.message ?? null,
        rows: matchedStaff?.map((s) => ({ email: s.email, venue_id: s.venue_id, role: s.role })) ?? [],
      },
    });
  } catch (err) {
    return NextResponse.json({
      step: 'unexpected',
      error: err instanceof Error ? err.message : 'unknown',
    });
  }
}
