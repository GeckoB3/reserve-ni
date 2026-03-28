import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getVenueStaff } from '@/lib/venue-auth';
import { getSupabaseAdminClient } from '@/lib/supabase';

/**
 * GET /api/venue/calendar-entitlement
 * Calendar / team limits for the current venue (for plan UI and availability).
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const staff = await getVenueStaff(supabase);
    if (!staff) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

    const admin = getSupabaseAdminClient();
    const { data: venue } = await admin
      .from('venues')
      .select('pricing_tier, calendar_count, booking_model')
      .eq('id', staff.venue_id)
      .single();

    if (!venue) return NextResponse.json({ error: 'Venue not found' }, { status: 404 });

    const tier = (venue.pricing_tier as string) ?? 'standard';
    const { count, error: countErr } = await admin
      .from('practitioners')
      .select('id', { count: 'exact', head: true })
      .eq('venue_id', staff.venue_id)
      .eq('is_active', true);

    if (countErr) {
      console.error('[calendar-entitlement] practitioner count failed:', countErr);
      return NextResponse.json({ error: 'Failed to load entitlement' }, { status: 500 });
    }

    const activePractitioners = count ?? 0;
    const unlimited = tier === 'business' || tier === 'founding';
    const calendarLimit = unlimited ? null : (venue.calendar_count ?? 1);
    const atCalendarLimit = !unlimited && calendarLimit !== null && activePractitioners >= calendarLimit;
    const canAddPractitioner = unlimited || (calendarLimit !== null && activePractitioners < calendarLimit);

    return NextResponse.json({
      pricing_tier: tier,
      calendar_count: venue.calendar_count ?? null,
      active_practitioners: activePractitioners,
      calendar_limit: calendarLimit,
      unlimited,
      at_calendar_limit: atCalendarLimit,
      can_add_practitioner: canAddPractitioner,
      booking_model: venue.booking_model,
    });
  } catch (err) {
    console.error('[calendar-entitlement] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
