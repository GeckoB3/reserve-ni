import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getVenueStaff } from '@/lib/venue-auth';
import { getSupabaseAdminClient } from '@/lib/supabase';
import { stripe } from '@/lib/stripe';
import { hasServiceConfig } from '@/lib/availability';
import { computeGuestBookingReady } from '@/lib/setup-guest-booking-ready';
import type { BookingModel } from '@/types/booking-models';

export interface SetupStatus {
  profile_complete: boolean;
  availability_set: boolean;
  /** True when guests can complete a booking on the public page (Model A: active services; Model B: catalog non-empty). */
  guest_booking_ready: boolean;
  stripe_connected: boolean;
  first_booking_made: boolean;
  is_admin: boolean;
  booking_model: BookingModel;
}

async function checkAvailabilitySet(
  admin: ReturnType<typeof getSupabaseAdminClient>,
  venueId: string,
  model: BookingModel,
): Promise<boolean> {
  switch (model) {
    case 'practitioner_appointment':
    case 'unified_scheduling': {
      const { count } = await admin
        .from('practitioners')
        .select('id', { count: 'exact', head: true })
        .eq('venue_id', venueId);
      return (count ?? 0) > 0;
    }
    case 'event_ticket': {
      const { count } = await admin
        .from('experience_events')
        .select('id', { count: 'exact', head: true })
        .eq('venue_id', venueId);
      return (count ?? 0) > 0;
    }
    case 'class_session': {
      const { count } = await admin
        .from('class_types')
        .select('id', { count: 'exact', head: true })
        .eq('venue_id', venueId);
      return (count ?? 0) > 0;
    }
    case 'resource_booking': {
      const { count } = await admin
        .from('venue_resources')
        .select('id', { count: 'exact', head: true })
        .eq('venue_id', venueId);
      return (count ?? 0) > 0;
    }
    default: {
      return hasServiceConfig(admin, venueId);
    }
  }
}

export async function GET() {
  try {
    const supabase = await createClient();
    const staff = await getVenueStaff(supabase);
    if (!staff) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

    const { data: venue } = await staff.db
      .from('venues')
      .select('name, address, phone, stripe_connected_account_id, booking_model')
      .eq('id', staff.venue_id)
      .single();

    if (!venue) return NextResponse.json({ error: 'Venue not found' }, { status: 404 });

    const bookingModel = (venue.booking_model as BookingModel) ?? 'table_reservation';
    const profileComplete = Boolean(venue.name && venue.address && venue.phone);

    const admin = getSupabaseAdminClient();
    const availabilitySet = await checkAvailabilitySet(admin, staff.venue_id, bookingModel);

    const guestBookingReady = await computeGuestBookingReady(
      admin,
      staff.venue_id,
      bookingModel,
      availabilitySet,
    );

    let stripeConnected = false;
    if (venue.stripe_connected_account_id) {
      try {
        const account = await stripe.accounts.retrieve(venue.stripe_connected_account_id);
        stripeConnected = account.charges_enabled === true && account.details_submitted === true;
      } catch {
        // Stripe fetch failed
      }
    }

    const { count: bookingCount } = await staff.db
      .from('bookings')
      .select('id', { count: 'exact', head: true })
      .eq('venue_id', staff.venue_id);

    const firstBookingMade = (bookingCount ?? 0) > 0;

    const status: SetupStatus = {
      profile_complete: profileComplete,
      availability_set: availabilitySet,
      guest_booking_ready: guestBookingReady,
      stripe_connected: stripeConnected,
      first_booking_made: firstBookingMade,
      is_admin: staff.role === 'admin',
      booking_model: bookingModel,
    };

    return NextResponse.json(status);
  } catch (err) {
    console.error('GET /api/venue/setup-status failed:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
