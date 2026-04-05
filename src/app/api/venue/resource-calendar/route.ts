import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getVenueStaff } from '@/lib/venue-auth';
import { getSupabaseAdminClient } from '@/lib/supabase';
import { resolveVenueMode } from '@/lib/venue-mode';
import {
  mapCalendarToResource,
  computeResourceAvailableDatesInMonth,
  fetchBookingsGroupedByDateForResourceMonth,
  attachHostCalendarsToResources,
} from '@/lib/availability/resource-booking-engine';

/**
 * GET /api/venue/resource-calendar?resource_id=&year=&month=&duration=
 * Staff: available dates for one resource in a calendar month.
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const staff = await getVenueStaff(supabase);
    if (!staff) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

    const { searchParams } = request.nextUrl;
    const resourceId = searchParams.get('resource_id');
    const yearParam = searchParams.get('year');
    const monthParam = searchParams.get('month');
    const durationParam = searchParams.get('duration');

    if (!resourceId) {
      return NextResponse.json({ error: 'resource_id is required' }, { status: 400 });
    }

    const year = yearParam ? parseInt(yearParam, 10) : NaN;
    const month = monthParam ? parseInt(monthParam, 10) : NaN;
    if (Number.isNaN(year) || year < 2000 || year > 2100) {
      return NextResponse.json({ error: 'Invalid year' }, { status: 400 });
    }
    if (Number.isNaN(month) || month < 1 || month > 12) {
      return NextResponse.json({ error: 'Invalid month (1–12)' }, { status: 400 });
    }

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

    const { data: row, error: rowErr } = await admin
      .from('unified_calendars')
      .select('*')
      .eq('id', resourceId)
      .eq('venue_id', staff.venue_id)
      .eq('calendar_type', 'resource')
      .maybeSingle();

    if (rowErr || !row) {
      return NextResponse.json({ error: 'Resource not found' }, { status: 404 });
    }

    let resource = mapCalendarToResource(row as Record<string, unknown>);
    if (!resource.is_active) {
      return NextResponse.json({ error: 'Resource not found' }, { status: 404 });
    }

    const [enriched] = await attachHostCalendarsToResources(admin, staff.venue_id, [resource]);
    resource = enriched ?? resource;

    const bookingsByDate = await fetchBookingsGroupedByDateForResourceMonth(
      admin,
      staff.venue_id,
      resourceId,
      year,
      month,
    );

    const available_dates = computeResourceAvailableDatesInMonth(
      resource,
      year,
      month,
      durationMinutes,
      bookingsByDate,
    );

    return NextResponse.json({
      venue_id: staff.venue_id,
      resource_id: resourceId,
      year,
      month,
      duration_minutes: durationMinutes,
      available_dates,
    });
  } catch (err) {
    console.error('GET /api/venue/resource-calendar failed:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
