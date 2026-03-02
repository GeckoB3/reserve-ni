import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase';
import { getAvailableSlots } from '@/lib/availability';
import type { VenueForAvailability, BookingForAvailability } from '@/types/availability';

/** GET /api/booking/availability?venue_id=uuid&date=YYYY-MM-DD&party_size=N (optional) */
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

    let partySize: number | null = null;
    if (partySizeParam != null) {
      const n = parseInt(partySizeParam, 10);
      if (Number.isNaN(n) || n < 1) {
        return NextResponse.json(
          { error: 'party_size must be a positive integer' },
          { status: 400 }
        );
      }
      partySize = n;
    }

    const supabase = getSupabaseAdminClient();

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
