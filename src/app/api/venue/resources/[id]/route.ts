import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getVenueStaff } from '@/lib/venue-auth';
import { getSupabaseAdminClient } from '@/lib/supabase';

/**
 * GET /api/venue/resources/[id] — single resource (venue-scoped).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const supabase = await createClient();
    const staff = await getVenueStaff(supabase);
    if (!staff) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

    const { id } = await params;
    const admin = getSupabaseAdminClient();

    const { data, error } = await admin
      .from('venue_resources')
      .select('*')
      .eq('id', id)
      .eq('venue_id', staff.venue_id)
      .maybeSingle();

    if (error) {
      console.error('GET /api/venue/resources/[id] failed:', error);
      return NextResponse.json({ error: 'Failed to fetch resource' }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json({ error: 'Resource not found' }, { status: 404 });
    }

    return NextResponse.json(data);
  } catch (err) {
    console.error('GET /api/venue/resources/[id] failed:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
