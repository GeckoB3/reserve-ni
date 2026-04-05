import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase';
import { resolveVenueMode } from '@/lib/venue-mode';
import { venueExposesBookingModel } from '@/lib/booking/enabled-models';
import {
  mapCalendarToResource,
  computeResourceAvailableDatesInMonth,
  fetchBookingsGroupedByDateForResourceMonth,
  attachHostCalendarsToResources,
} from '@/lib/availability/resource-booking-engine';

/**
 * GET /api/booking/resource-calendar?venue_id=&resource_id=&year=&month=&duration=
 * Dates in that month (YYYY-MM-DD) with at least one available slot for the duration.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const venueId = searchParams.get('venue_id');
    const resourceId = searchParams.get('resource_id');
    const yearParam = searchParams.get('year');
    const monthParam = searchParams.get('month');
    const durationParam = searchParams.get('duration');

    if (!venueId || !resourceId) {
      return NextResponse.json({ error: 'venue_id and resource_id are required' }, { status: 400 });
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

    const supabase = getSupabaseAdminClient();
    const venueMode = await resolveVenueMode(supabase, venueId);
    if (!venueExposesBookingModel(venueMode.bookingModel, venueMode.enabledModels, 'resource_booking')) {
      return NextResponse.json({ error: 'Resource bookings are not available for this venue' }, { status: 403 });
    }

    const { data: row, error: rowErr } = await supabase
      .from('unified_calendars')
      .select('*')
      .eq('id', resourceId)
      .eq('venue_id', venueId)
      .eq('calendar_type', 'resource')
      .maybeSingle();

    if (rowErr || !row) {
      return NextResponse.json({ error: 'Resource not found' }, { status: 404 });
    }

    let resource = mapCalendarToResource(row as Record<string, unknown>);
    if (!resource.is_active) {
      return NextResponse.json({ error: 'Resource not found' }, { status: 404 });
    }

    const [enriched] = await attachHostCalendarsToResources(supabase, venueId, [resource]);
    resource = enriched ?? resource;

    const bookingsByDate = await fetchBookingsGroupedByDateForResourceMonth(
      supabase,
      venueId,
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
      venue_id: venueId,
      resource_id: resourceId,
      year,
      month,
      duration_minutes: durationMinutes,
      available_dates,
    });
  } catch (err) {
    console.error('GET /api/booking/resource-calendar failed:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
