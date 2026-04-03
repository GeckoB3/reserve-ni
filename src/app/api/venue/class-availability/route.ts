import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getVenueStaff } from '@/lib/venue-auth';
import { getSupabaseAdminClient } from '@/lib/supabase';
import { resolveVenueMode } from '@/lib/venue-mode';
import { fetchClassInput, computeClassAvailability } from '@/lib/availability/class-session-engine';

/**
 * GET /api/venue/class-availability?date=YYYY-MM-DD
 * Staff-only class availability for the signed-in venue (supports primary or `enabled_models` secondary).
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const staff = await getVenueStaff(supabase);
    if (!staff) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

    const date = request.nextUrl.searchParams.get('date');
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ error: 'Valid date query parameter is required' }, { status: 400 });
    }

    const admin = getSupabaseAdminClient();
    const venueMode = await resolveVenueMode(admin, staff.venue_id);
    const canClass =
      venueMode.bookingModel === 'class_session' || venueMode.enabledModels.includes('class_session');
    if (!canClass) {
      return NextResponse.json({ error: 'This venue does not offer class session bookings' }, { status: 403 });
    }

    const input = await fetchClassInput({ supabase: admin, venueId: staff.venue_id, date });
    const result = computeClassAvailability(input);

    return NextResponse.json({ date, venue_id: staff.venue_id, classes: result });
  } catch (err) {
    console.error('GET /api/venue/class-availability failed:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
