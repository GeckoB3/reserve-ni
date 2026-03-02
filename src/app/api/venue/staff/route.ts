import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getVenueStaff } from '@/lib/venue-auth';

/** GET /api/venue/staff — list staff for the authenticated user's venue. */
export async function GET() {
  try {
    const supabase = await createClient();
    const staff = await getVenueStaff(supabase);
    if (!staff) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    }

    const { data: rows, error } = await supabase
      .from('staff')
      .select('id, email, name, role, created_at')
      .eq('venue_id', staff.venue_id)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('GET /api/venue/staff failed:', error);
      return NextResponse.json({ error: 'Failed to load staff' }, { status: 500 });
    }

    return NextResponse.json({ staff: rows ?? [] });
  } catch (err) {
    console.error('GET /api/venue/staff failed:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
