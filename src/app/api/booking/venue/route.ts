import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase';
import { resolveVenueMode } from '@/lib/venue-mode';
import { listActiveAreasForVenue } from '@/lib/areas/resolve-default-area';

/**
 * GET /api/booking/venue?slug=venue-slug
 * Public: returns venue profile for the booking page (name, cover, slug, deposit_config, booking_rules, id).
 * Does not expose stripe_connected_account_id to client.
 *
 * When the venue uses the service-based availability engine, booking_rules
 * is populated from booking_restrictions so the party size selector reflects
 * the correct limits.
 */
export async function GET(request: NextRequest) {
  try {
    const slug = request.nextUrl.searchParams.get('slug');
    if (!slug?.trim()) {
      return NextResponse.json({ error: 'Missing slug' }, { status: 400 });
    }

    const supabase = getSupabaseAdminClient();
    const { data: venue, error } = await supabase
      .from('venues')
      .select('id, name, slug, cover_photo_url, address, phone, website_url, deposit_config, booking_rules, opening_hours, timezone, booking_model, enabled_models, active_booking_models, terminology, currency, public_booking_area_mode')
      .eq('slug', slug.trim())
      .single();

    if (error || !venue) {
      return NextResponse.json({ error: 'Venue not found' }, { status: 404 });
    }

    const venueMode = await resolveVenueMode(supabase, venue.id);

    if (venueMode.bookingModel === 'table_reservation') {
      const usesNewEngine = venueMode.availabilityEngine === 'service';
      if (usesNewEngine) {
        const { data: restriction } = await supabase
          .from('booking_restrictions')
          .select('min_party_size_online, max_party_size_online')
          .eq('venue_id', venue.id)
          .limit(1)
          .maybeSingle();

        if (restriction) {
          venue.booking_rules = {
            min_party_size: restriction.min_party_size_online,
            max_party_size: restriction.max_party_size_online,
          };
        }
      }
    }

    let areas: Awaited<ReturnType<typeof listActiveAreasForVenue>> = [];
    if (venueMode.bookingModel === 'table_reservation') {
      areas = await listActiveAreasForVenue(supabase, venue.id);
    }

    return NextResponse.json({
      ...venue,
      booking_model: venueMode.bookingModel,
      active_booking_models: venueMode.activeBookingModels,
      enabled_models: venueMode.enabledModels,
      terminology: venueMode.terminology,
      areas,
    });
  } catch (err) {
    console.error('GET /api/booking/venue failed:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
