import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getVenueStaff } from '@/lib/venue-auth';
import { getSupabaseAdminClient } from '@/lib/supabase';
import { stripe } from '@/lib/stripe';
import { hasServiceConfig } from '@/lib/availability';
import { computeGuestBookingReady } from '@/lib/setup-guest-booking-ready';
import type { BookingModel } from '@/types/booking-models';
import {
  activeModelsToLegacyEnabledModels,
  getDefaultBookingModelFromActive,
  resolveActiveBookingModels,
} from '@/lib/booking/active-models';

export interface SetupStatus {
  profile_complete: boolean;
  availability_set: boolean;
  /** True when guests can complete a booking on the public page (Model A: active services; Model B: catalog non-empty). */
  guest_booking_ready: boolean;
  stripe_connected: boolean;
  first_booking_made: boolean;
  is_admin: boolean;
  booking_model: BookingModel;
  active_booking_models: BookingModel[];
  /** Normalised secondary models (C/D/E). */
  enabled_models: BookingModel[];
  /**
   * When `event_ticket` is in `enabled_models`, true if at least one experience event exists.
   * When not enabled, always true (N/A).
   */
  secondary_event_catalog_ready: boolean;
  secondary_class_catalog_ready: boolean;
  secondary_resource_catalog_ready: boolean;
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

    const venueId = staff.venue_id;

    const { data: venue } = await staff.db
      .from('venues')
      .select('name, address, phone, stripe_connected_account_id, booking_model, enabled_models, active_booking_models, pricing_tier')
      .eq('id', venueId)
      .single();

    if (!venue) return NextResponse.json({ error: 'Venue not found' }, { status: 404 });

    const activeModels = resolveActiveBookingModels({
      pricingTier: (venue as { pricing_tier?: string | null }).pricing_tier,
      bookingModel: venue.booking_model as BookingModel | undefined,
      enabledModels: (venue as { enabled_models?: unknown }).enabled_models,
      activeBookingModels: (venue as { active_booking_models?: unknown }).active_booking_models,
    });
    const bookingModel = getDefaultBookingModelFromActive(
      activeModels,
      (venue.booking_model as BookingModel) ?? 'table_reservation',
    );
    const enabledModels = activeModelsToLegacyEnabledModels(activeModels, bookingModel);
    const profileComplete = Boolean(venue.name && venue.address && venue.phone);

    const admin = getSupabaseAdminClient();
    const availabilitySet = await checkAvailabilitySet(admin, venueId, bookingModel);

    const guestBookingReady = await computeGuestBookingReady(
      admin,
      venueId,
      bookingModel,
      availabilitySet,
    );

    async function secondaryCatalogReady(m: BookingModel): Promise<boolean> {
      if (!enabledModels.includes(m)) return true;
      return checkAvailabilitySet(admin, venueId, m);
    }

    const [secondaryEventCatalogReady, secondaryClassCatalogReady, secondaryResourceCatalogReady] =
      await Promise.all([
        secondaryCatalogReady('event_ticket'),
        secondaryCatalogReady('class_session'),
        secondaryCatalogReady('resource_booking'),
      ]);

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
      .eq('venue_id', venueId);

    const firstBookingMade = (bookingCount ?? 0) > 0;

    const status: SetupStatus = {
      profile_complete: profileComplete,
      availability_set: availabilitySet,
      guest_booking_ready: guestBookingReady,
      stripe_connected: stripeConnected,
      first_booking_made: firstBookingMade,
      is_admin: staff.role === 'admin',
      booking_model: bookingModel,
      active_booking_models: activeModels,
      enabled_models: enabledModels,
      secondary_event_catalog_ready: secondaryEventCatalogReady,
      secondary_class_catalog_ready: secondaryClassCatalogReady,
      secondary_resource_catalog_ready: secondaryResourceCatalogReady,
    };

    return NextResponse.json(status);
  } catch (err) {
    console.error('GET /api/venue/setup-status failed:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
