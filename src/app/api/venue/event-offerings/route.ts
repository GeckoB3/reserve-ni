import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getVenueStaff } from '@/lib/venue-auth';
import { getSupabaseAdminClient } from '@/lib/supabase';
import { resolveVenueMode } from '@/lib/venue-mode';
import {
  buildEventOfferingSummaries,
  computeEventAvailability,
  fetchEventInputForRange,
} from '@/lib/availability/event-ticket-engine';

function addDaysIso(from: string, days: number): string {
  const [y, m, d] = from.split('-').map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d!));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

/**
 * GET /api/venue/event-offerings?from=YYYY-MM-DD&days=90
 * Staff: event series with bookable dates in range + full occurrence rows for calendar selection.
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const staff = await getVenueStaff(supabase);
    if (!staff) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

    const daysRaw = request.nextUrl.searchParams.get('days');
    const days = Math.min(120, Math.max(7, parseInt(daysRaw ?? '90', 10) || 90));
    const fromParam = request.nextUrl.searchParams.get('from');
    const from =
      fromParam && /^\d{4}-\d{2}-\d{2}$/.test(fromParam) ? fromParam : new Date().toISOString().slice(0, 10);
    const to = addDaysIso(from, days);

    const admin = getSupabaseAdminClient();
    const venueMode = await resolveVenueMode(admin, staff.venue_id);
    const canEvents =
      venueMode.bookingModel === 'event_ticket' || venueMode.enabledModels.includes('event_ticket');
    if (!canEvents) {
      return NextResponse.json({ error: 'This venue does not offer event ticket bookings' }, { status: 403 });
    }

    const input = await fetchEventInputForRange({
      supabase: admin,
      venueId: staff.venue_id,
      fromDate: from,
      toDate: to,
    });
    const slots = computeEventAvailability(input);
    const events = buildEventOfferingSummaries(slots);

    return NextResponse.json({
      venue_id: staff.venue_id,
      from,
      to,
      events,
      instances: slots,
    });
  } catch (err) {
    console.error('GET /api/venue/event-offerings failed:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
