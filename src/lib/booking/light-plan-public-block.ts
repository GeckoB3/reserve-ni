import type { SupabaseClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

/**
 * Appointments Light: when billing is past due, online booking must be disabled (matches `booking_paused` on public venue loads).
 */
export function isOnlineBookingBlockedForLightPastDue(
  pricingTier: string | null | undefined,
  planStatus: string | null | undefined,
): boolean {
  return (pricingTier ?? '').toLowerCase() === 'light' && (planStatus ?? '').toLowerCase() === 'past_due';
}

/**
 * For authenticated reads of venue rows that already include `pricing_tier` and `plan_status`.
 * Returns a JSON 403 response when online booking must be blocked.
 */
export function nextResponseIfPublicBookingBlockedFromVenueRow(row: {
  pricing_tier?: string | null;
  plan_status?: string | null;
}): NextResponse | null {
  if (isOnlineBookingBlockedForLightPastDue(row.pricing_tier, row.plan_status)) {
    return NextResponse.json(
      { error: 'Online booking is temporarily unavailable for this venue.' },
      { status: 403 },
    );
  }
  return null;
}

/**
 * Load plan fields for `venueId` and return 403 when Light + past_due (public booking APIs).
 */
export async function nextResponseIfPublicBookingBlockedForVenue(
  admin: SupabaseClient,
  venueId: string,
): Promise<NextResponse | null> {
  const { data: row, error } = await admin
    .from('venues')
    .select('pricing_tier, plan_status')
    .eq('id', venueId)
    .maybeSingle();

  if (error) {
    console.error('[public booking guard] venue lookup failed:', error.message, { venueId });
    return NextResponse.json({ error: 'Venue not found' }, { status: 404 });
  }
  if (!row) {
    return NextResponse.json({ error: 'Venue not found' }, { status: 404 });
  }

  return nextResponseIfPublicBookingBlockedFromVenueRow(
    row as { pricing_tier?: string | null; plan_status?: string | null },
  );
}
