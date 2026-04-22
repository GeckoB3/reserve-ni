import type { SupabaseClient } from '@supabase/supabase-js';
import type { VenuePublic } from '@/components/booking/types';
import { DEFAULT_ENTITY_BOOKING_WINDOW } from '@/lib/booking/entity-booking-window';

/** Reads `max_advance_booking_days` from persisted `venues.booking_rules` JSON (settings / legacy). */
export function maxAdvanceDaysFromVenueBookingRulesJson(raw: unknown): number {
  if (!raw || typeof raw !== 'object') return DEFAULT_ENTITY_BOOKING_WINDOW.max_advance_booking_days;
  const n = (raw as { max_advance_booking_days?: unknown }).max_advance_booking_days;
  if (typeof n === 'number' && Number.isFinite(n)) {
    return Math.min(365, Math.max(1, Math.floor(n)));
  }
  return DEFAULT_ENTITY_BOOKING_WINDOW.max_advance_booking_days;
}

/**
 * For table venues on the service availability engine, merge `booking_restrictions` into the
 * public `booking_rules` shape (party limits + max advance). When multiple dining services exist,
 * party bounds use the union guests can pick (min of minimums, max of maximums); advance window
 * uses the largest `max_advance_days` so a date remains selectable if any service can still offer slots.
 */
export async function mergePublicTableBookingRulesFromRestrictions(
  supabase: SupabaseClient,
  venueId: string,
  venueBookingRulesJson: unknown,
): Promise<VenuePublic['booking_rules']> {
  const raw =
    venueBookingRulesJson && typeof venueBookingRulesJson === 'object'
      ? { ...(venueBookingRulesJson as Record<string, unknown>) }
      : ({} as Record<string, unknown>);
  const baseMax = maxAdvanceDaysFromVenueBookingRulesJson(venueBookingRulesJson);

  /**
   * `booking_restrictions` rows are keyed by `service_id` → `venue_services`, not `venue_id`.
   * Match the dashboard Booking Rules tab and the availability engine by loading restrictions
   * for every active dining service at this venue (all areas), then aggregate.
   */
  const { data: venueServices, error: servicesError } = await supabase
    .from('venue_services')
    .select('id')
    .eq('venue_id', venueId)
    .eq('is_active', true);

  if (servicesError) {
    console.warn('[mergePublicTableBookingRulesFromRestrictions] venue_services:', servicesError.message);
  }

  const serviceIds = (venueServices ?? []).map((s) => s.id).filter(Boolean);
  let rows: Array<{
    min_party_size_online?: unknown;
    max_party_size_online?: unknown;
    max_advance_days?: unknown;
  }> = [];

  if (serviceIds.length > 0) {
    const { data: restrictions, error } = await supabase
      .from('booking_restrictions')
      .select('min_party_size_online, max_party_size_online, max_advance_days')
      .in('service_id', serviceIds);

    if (error) {
      console.warn('[mergePublicTableBookingRulesFromRestrictions] booking_restrictions:', error.message);
    }
    rows = restrictions ?? [];
  }
  if (rows.length === 0) {
    if (raw.min_party_size == null || typeof raw.min_party_size !== 'number') raw.min_party_size = 1;
    if (raw.max_party_size == null || typeof raw.max_party_size !== 'number') raw.max_party_size = 20;
    raw.max_advance_booking_days = baseMax;
    return raw as unknown as VenuePublic['booking_rules'];
  }

  const mins = rows
    .map((r) => Number((r as { min_party_size_online?: unknown }).min_party_size_online))
    .filter((n) => Number.isFinite(n));
  const maxs = rows
    .map((r) => Number((r as { max_party_size_online?: unknown }).max_party_size_online))
    .filter((n) => Number.isFinite(n));
  const advs = rows
    .map((r) => Number((r as { max_advance_days?: unknown }).max_advance_days))
    .filter((n) => Number.isFinite(n));

  if (mins.length) raw.min_party_size = Math.min(...mins);
  if (maxs.length) raw.max_party_size = Math.max(...maxs);
  if (advs.length) {
    raw.max_advance_booking_days = Math.min(365, Math.max(1, Math.max(...advs)));
  } else {
    raw.max_advance_booking_days = baseMax;
  }

  return raw as unknown as VenuePublic['booking_rules'];
}
