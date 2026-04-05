import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getVenueStaff } from '@/lib/venue-auth';
import { getSupabaseAdminClient } from '@/lib/supabase';
import { resolveVenueMode } from '@/lib/venue-mode';
import {
  buildClassOfferingSummaries,
  computeClassAvailability,
  fetchClassInputForRange,
} from '@/lib/availability/class-session-engine';

function addDaysIso(from: string, days: number): string {
  const [y, m, d] = from.split('-').map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d!));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

/**
 * GET /api/venue/class-offerings?from=YYYY-MM-DD&days=90
 * Staff: same shape as public class-offerings; includes sessions inside min-notice (staff can book walk-ins).
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
    const canClass =
      venueMode.bookingModel === 'class_session' || venueMode.enabledModels.includes('class_session');
    if (!canClass) {
      return NextResponse.json({ error: 'This venue does not offer class session bookings' }, { status: 403 });
    }

    const input = await fetchClassInputForRange({
      supabase: admin,
      venueId: staff.venue_id,
      fromDate: from,
      toDate: to,
      forPublicBooking: false,
    });
    const slots = computeClassAvailability(input);
    const classes = buildClassOfferingSummaries(slots);

    return NextResponse.json({
      venue_id: staff.venue_id,
      from,
      to,
      classes,
      instances: slots,
    });
  } catch (err) {
    console.error('GET /api/venue/class-offerings failed:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
