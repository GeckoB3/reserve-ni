import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getVenueStaff } from '@/lib/venue-auth';
import { getSupabaseAdminClient } from '@/lib/supabase';
import { resolveVenueMode } from '@/lib/venue-mode';
import { fetchResourceInput, computeResourceAvailability } from '@/lib/availability/resource-booking-engine';

/**
 * GET /api/venue/resource-availability?date=YYYY-MM-DD&duration=60
 * Staff-only resource slots for the signed-in venue (primary or secondary `resource_booking`).
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

    const durationParam = request.nextUrl.searchParams.get('duration');
    const durationMinutes = durationParam ? parseInt(durationParam, 10) : 60;
    if (Number.isNaN(durationMinutes) || durationMinutes < 5 || durationMinutes > 1440) {
      return NextResponse.json({ error: 'duration must be between 5 and 1440 minutes' }, { status: 400 });
    }

    const admin = getSupabaseAdminClient();
    const venueMode = await resolveVenueMode(admin, staff.venue_id);
    const canResource =
      venueMode.bookingModel === 'resource_booking' ||
      venueMode.enabledModels.includes('resource_booking');
    if (!canResource) {
      return NextResponse.json({ error: 'This venue does not offer resource bookings' }, { status: 403 });
    }

    const input = await fetchResourceInput({ supabase: admin, venueId: staff.venue_id, date });
    const result = computeResourceAvailability(input, durationMinutes);

    return NextResponse.json({
      date,
      venue_id: staff.venue_id,
      duration_minutes: durationMinutes,
      resources: result,
    });
  } catch (err) {
    console.error('GET /api/venue/resource-availability failed:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
