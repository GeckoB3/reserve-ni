import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase';
import { resolveVenueMode } from '@/lib/venue-mode';
import { venueExposesBookingModel } from '@/lib/booking/enabled-models';
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
 * GET /api/booking/event-offerings?venue_id=uuid&from=YYYY-MM-DD&days=90
 * Public: event series with bookable dates in range + occurrence rows (guest booking rules applied).
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const venueId = searchParams.get('venue_id');
    if (!venueId) {
      return NextResponse.json({ error: 'Missing venue_id' }, { status: 400 });
    }

    const daysRaw = searchParams.get('days');
    const days = Math.min(120, Math.max(7, parseInt(daysRaw ?? '90', 10) || 90));
    const fromParam = searchParams.get('from');
    const from =
      fromParam && /^\d{4}-\d{2}-\d{2}$/.test(fromParam) ? fromParam : new Date().toISOString().slice(0, 10);
    const to = addDaysIso(from, days);

    const supabase = getSupabaseAdminClient();
    const venueMode = await resolveVenueMode(supabase, venueId);
    if (!venueExposesBookingModel(venueMode.bookingModel, venueMode.enabledModels, 'event_ticket')) {
      return NextResponse.json({ error: 'Event booking is not available for this venue' }, { status: 403 });
    }

    const { data: v } = await supabase.from('venues').select('timezone').eq('id', venueId).maybeSingle();
    const tz =
      typeof (v as { timezone?: string | null } | null)?.timezone === 'string' &&
      String((v as { timezone?: string | null }).timezone).trim() !== ''
        ? String((v as { timezone?: string | null }).timezone).trim()
        : 'Europe/London';

    const input = await fetchEventInputForRange({
      supabase,
      venueId,
      fromDate: from,
      toDate: to,
    });
    const slots = computeEventAvailability(input, { venueTimezone: tz });
    const events = buildEventOfferingSummaries(slots);

    return NextResponse.json({
      venue_id: venueId,
      from,
      to,
      events,
      instances: slots,
    });
  } catch (err) {
    console.error('GET /api/booking/event-offerings failed:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
