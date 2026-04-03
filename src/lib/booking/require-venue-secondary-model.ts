import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizeEnabledModels, venueExposesBookingModel } from '@/lib/booking/enabled-models';
import type { BookingModel } from '@/types/booking-models';

export type CdeSecondaryModel = Extract<BookingModel, 'event_ticket' | 'class_session' | 'resource_booking'>;

const ERROR_MESSAGE =
  'This booking type is not enabled for your venue. Enable it under Settings → Profile → Additional booking types.';

/**
 * Ensures the venue exposes the given C/D/E model (primary or in `enabled_models`).
 * Use on mutating staff APIs for classes, events, and resources.
 */
export async function requireVenueExposesSecondaryModel(
  admin: SupabaseClient,
  venueId: string,
  model: CdeSecondaryModel
): Promise<{ ok: true } | { ok: false; response: NextResponse }> {
  const { data: venue, error } = await admin
    .from('venues')
    .select('booking_model, enabled_models')
    .eq('id', venueId)
    .single();

  if (error || !venue) {
    return { ok: false, response: NextResponse.json({ error: 'Venue not found' }, { status: 404 }) };
  }

  const primary = ((venue as { booking_model?: string }).booking_model as BookingModel) ?? 'table_reservation';
  const enabledModels = normalizeEnabledModels(
    (venue as { enabled_models?: unknown }).enabled_models,
    primary,
  );

  if (!venueExposesBookingModel(primary, enabledModels, model)) {
    return { ok: false, response: NextResponse.json({ error: ERROR_MESSAGE }, { status: 403 }) };
  }

  return { ok: true };
}
