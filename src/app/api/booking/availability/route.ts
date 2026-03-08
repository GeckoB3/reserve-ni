import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase';
import { getAvailableSlots, computeAvailability, hasServiceConfig, fetchEngineInput } from '@/lib/availability';
import type { VenueForAvailability, BookingForAvailability } from '@/types/availability';

/** GET /api/booking/availability?venue_id=uuid&date=YYYY-MM-DD&party_size=N */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const venueId = searchParams.get('venue_id');
    const dateStr = searchParams.get('date');
    const partySizeParam = searchParams.get('party_size');

    if (!venueId || !dateStr) {
      return NextResponse.json(
        { error: 'Missing required query params: venue_id, date' },
        { status: 400 }
      );
    }

    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(dateStr)) {
      return NextResponse.json(
        { error: 'Invalid date format; use YYYY-MM-DD' },
        { status: 400 }
      );
    }

    const partySize = partySizeParam ? parseInt(partySizeParam, 10) : null;
    if (partySize != null && (Number.isNaN(partySize) || partySize < 1)) {
      return NextResponse.json(
        { error: 'party_size must be a positive integer' },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdminClient();
    const useServiceEngine = await hasServiceConfig(supabase, venueId);

    if (useServiceEngine) {
      const engineInput = await fetchEngineInput({
        supabase,
        venueId,
        date: dateStr,
        partySize: partySize ?? 2,
      });

      const results = computeAvailability(engineInput);

      const allSlots = results.flatMap((r) => r.slots);
      const largePartyRedirect = results.find((r) => r.large_party_redirect);

      return NextResponse.json({
        date: dateStr,
        venue_id: venueId,
        slots: allSlots,
        services: results.map((r) => ({
          id: r.service.id,
          name: r.service.name,
          slots: r.slots,
          large_party_redirect: r.large_party_redirect,
          large_party_message: r.large_party_message,
        })),
        large_party_redirect: largePartyRedirect?.large_party_redirect ?? false,
        large_party_message: largePartyRedirect?.large_party_message ?? null,
      });
    }

    // Legacy JSONB-based engine
    const [venueRes, bookingsRes] = await Promise.all([
      supabase.from('venues').select('id, opening_hours, availability_config, timezone').eq('id', venueId).single(),
      supabase
        .from('bookings')
        .select('id, booking_date, booking_time, party_size, status')
        .eq('venue_id', venueId)
        .eq('booking_date', dateStr),
    ]);

    if (venueRes.error || !venueRes.data) {
      return NextResponse.json({ error: 'Venue not found' }, { status: 404 });
    }

    const venue: VenueForAvailability = {
      id: venueRes.data.id,
      opening_hours: venueRes.data.opening_hours,
      availability_config: venueRes.data.availability_config,
      timezone: venueRes.data.timezone ?? 'Europe/London',
    };

    const bookings: BookingForAvailability[] = (bookingsRes.data ?? []).map((r) => ({
      id: r.id,
      booking_date: r.booking_date,
      booking_time: typeof r.booking_time === 'string' ? r.booking_time.slice(0, 5) : '00:00',
      party_size: r.party_size,
      status: r.status,
    }));

    const slots = getAvailableSlots(venue, dateStr, bookings);

    let result = slots;
    if (partySize != null && partySize > 0) {
      result = slots.filter((s) => s.available_covers >= partySize);
    }

    return NextResponse.json({
      date: dateStr,
      venue_id: venueId,
      slots: result,
    });
  } catch (error) {
    console.error('Availability fetch failed:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
