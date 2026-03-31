import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase';
import { fetchAppointmentCatalog } from '@/lib/availability/appointment-catalog';
import { resolveVenueMode } from '@/lib/venue-mode';

/**
 * GET /api/booking/appointment-catalog?venue_id=uuid
 * Active practitioners and services for guest pickers — no date, no slot computation.
 */
export async function GET(request: NextRequest) {
  try {
    const venueId = new URL(request.url).searchParams.get('venue_id');
    if (!venueId) {
      return NextResponse.json({ error: 'Missing required query param: venue_id' }, { status: 400 });
    }

    const practitionerSlug = new URL(request.url).searchParams.get('practitioner_slug')?.trim();

    const supabase = getSupabaseAdminClient();
    const venueMode = await resolveVenueMode(supabase, venueId);
    if (venueMode.bookingModel !== 'practitioner_appointment') {
      return NextResponse.json({ error: 'Not an appointment venue' }, { status: 404 });
    }

    const catalog = await fetchAppointmentCatalog(supabase, venueId, {
      practitionerSlug: practitionerSlug || undefined,
    });
    if (practitionerSlug && catalog.practitioners.length === 0) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return NextResponse.json(catalog);
  } catch (error) {
    console.error('[appointment-catalog] Failed:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
