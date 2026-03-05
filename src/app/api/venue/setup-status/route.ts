import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getVenueStaff } from '@/lib/venue-auth';
import { stripe } from '@/lib/stripe';

export interface SetupStatus {
  profile_complete: boolean;
  opening_hours_set: boolean;
  availability_set: boolean;
  stripe_connected: boolean;
  first_booking_made: boolean;
}

export async function GET() {
  try {
    const supabase = await createClient();
    const staff = await getVenueStaff(supabase);
    if (!staff) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

    const { data: venue } = await staff.db
      .from('venues')
      .select('name, address, phone, opening_hours, availability_config, stripe_connected_account_id')
      .eq('id', staff.venue_id)
      .single();

    if (!venue) return NextResponse.json({ error: 'Venue not found' }, { status: 404 });

    const profileComplete = Boolean(venue.name && venue.address && venue.phone);

    const openingHours = venue.opening_hours as Record<string, { closed?: boolean }> | null;
    const openingHoursSet = openingHours != null
      && Object.values(openingHours).some((day) => !day.closed);

    const availabilitySet = venue.availability_config != null;

    let stripeConnected = false;
    if (venue.stripe_connected_account_id) {
      try {
        const account = await stripe.accounts.retrieve(venue.stripe_connected_account_id);
        stripeConnected = account.charges_enabled === true && account.details_submitted === true;
      } catch {
        // Stripe fetch failed — treat as not connected
      }
    }

    const { count: bookingCount } = await staff.db
      .from('bookings')
      .select('id', { count: 'exact', head: true })
      .eq('venue_id', staff.venue_id);

    const firstBookingMade = (bookingCount ?? 0) > 0;

    const status: SetupStatus = {
      profile_complete: profileComplete,
      opening_hours_set: openingHoursSet,
      availability_set: availabilitySet,
      stripe_connected: stripeConnected,
      first_booking_made: firstBookingMade,
    };

    return NextResponse.json(status);
  } catch (err) {
    console.error('GET /api/venue/setup-status failed:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
