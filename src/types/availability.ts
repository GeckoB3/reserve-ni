/**
 * Availability engine types. Schemas for venue availability_config and
 * opening_hours JSONB, and results from getAvailableSlots.
 *
 * The engine supports TWO modes:
 *   1. Legacy JSONB mode (availability_config on venues) — kept for backward compatibility
 *   2. Service-based mode (venue_services + related tables) — the new gold standard
 */

/** Day of week 0=Sunday, 1=Monday, ..., 6=Saturday (matches JS Date.getDay()) */
export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6;

// ---------------------------------------------------------------------------
// Legacy types (JSONB-based config on venues table)
// ---------------------------------------------------------------------------

/** One service period (open/close). */
export interface OpeningHoursPeriod {
  open: string;  // "HH:mm"
  close: string; // "HH:mm"
}

/** Legacy: single range per day. */
export interface OpeningHoursDayLegacy {
  open: string;
  close: string;
}

/** New format: closed or up to 2 periods per day. */
export type OpeningHoursDay =
  | { closed: true }
  | { periods: OpeningHoursPeriod[] };

/** Opening hours: keys "0".."6" (Sunday–Saturday). Legacy single range or new periods format. */
export type OpeningHours = Partial<Record<string, OpeningHoursDayLegacy | OpeningHoursDay>>;

/** Fixed-intervals model: interval 15 or 30 min, slots from opening hours. */
export interface FixedIntervalsConfig {
  model: 'fixed_intervals';
  interval_minutes: 15 | 30;
  max_covers_by_day?: Partial<Record<string, number>>;
  turn_time_enabled?: boolean;
  sitting_duration_minutes?: number;
}

/** One named sitting with start/end and max covers. */
export interface NamedSitting {
  id: string;
  name: string;
  start_time: string;
  end_time: string;
  max_covers: number;
  max_covers_by_day?: Partial<Record<string, number>>;
}

/** Named-sittings model: venue defines sittings; guests book into a sitting. */
export interface NamedSittingsConfig {
  model: 'named_sittings';
  sittings: NamedSitting[];
}

/** Blocked slot: specific date and optional time range. */
export interface BlockedSlot {
  date: string;
  start_time?: string;
  end_time?: string;
}

export type AvailabilityConfig =
  | (FixedIntervalsConfig & { blocked_dates?: string[]; blocked_slots?: BlockedSlot[] })
  | (NamedSittingsConfig & { blocked_dates?: string[]; blocked_slots?: BlockedSlot[] });

/** Venue shape needed by the LEGACY availability engine (subset of DB row). */
export interface VenueForAvailability {
  id: string;
  opening_hours: OpeningHours | null;
  availability_config: AvailabilityConfig | null;
  timezone: string;
}

/** Booking shape needed for capacity (subset of DB row). */
export interface BookingForAvailability {
  id: string;
  booking_date: string;
  booking_time: string;
  party_size: number;
  status: string;
}

/** One available slot or sitting returned to the client. */
export interface AvailableSlot {
  key: string;
  label: string;
  start_time: string;
  end_time: string;
  available_covers: number;
  sitting_id?: string;
}

// ---------------------------------------------------------------------------
// Service-based types (new tables)
// ---------------------------------------------------------------------------

/** Row from venue_services table. */
export interface VenueService {
  id: string;
  venue_id: string;
  name: string;
  days_of_week: number[];
  start_time: string;
  end_time: string;
  last_booking_time: string;
  is_active: boolean;
  sort_order: number;
}

/** Row from service_capacity_rules table. */
export interface ServiceCapacityRule {
  id: string;
  service_id: string;
  max_covers_per_slot: number;
  max_bookings_per_slot: number;
  slot_interval_minutes: number;
  buffer_minutes: number;
  day_of_week: number | null;
  time_range_start: string | null;
  time_range_end: string | null;
}

/** Row from party_size_durations table. */
export interface PartySizeDuration {
  id: string;
  service_id: string;
  min_party_size: number;
  max_party_size: number;
  duration_minutes: number;
  day_of_week: number | null;
}

/** Row from booking_restrictions table. */
export interface BookingRestriction {
  id: string;
  service_id: string;
  min_advance_minutes: number;
  max_advance_days: number;
  min_party_size_online: number;
  max_party_size_online: number;
  large_party_threshold: number | null;
  large_party_message: string | null;
  deposit_required_from_party_size: number | null;
}

/** Row from availability_blocks table. */
export interface AvailabilityBlock {
  id: string;
  venue_id: string;
  service_id: string | null;
  block_type: 'closed' | 'reduced_capacity' | 'special_event';
  date_start: string;
  date_end: string;
  time_start: string | null;
  time_end: string | null;
  override_max_covers: number | null;
  reason: string | null;
}

/** Extended booking shape with service_id and estimated_end_time. */
export interface BookingForEngine {
  id: string;
  booking_date: string;
  booking_time: string;
  party_size: number;
  status: string;
  service_id: string | null;
  estimated_end_time: string | null;
}

/** Enhanced available slot returned by the new service-based engine. */
export interface ServiceAvailableSlot {
  key: string;
  label: string;
  start_time: string;
  end_time: string;
  service_name: string;
  service_id: string;
  available_covers: number;
  available_bookings: number;
  estimated_duration: number;
  deposit_required: boolean;
  deposit_amount: number | null;
  limited: boolean;
}

/** All data the engine needs to compute availability for a single date, pre-fetched. */
export interface EngineInput {
  venue_id: string;
  date: string;
  party_size: number;
  services: VenueService[];
  capacity_rules: ServiceCapacityRule[];
  durations: PartySizeDuration[];
  restrictions: BookingRestriction[];
  blocks: AvailabilityBlock[];
  bookings: BookingForEngine[];
  deposit_config: {
    enabled: boolean;
    amount_per_person_gbp: number;
  } | null;
  now: Date;
}

/** Result of engine computation for a single service. */
export interface EngineServiceResult {
  service: VenueService;
  slots: ServiceAvailableSlot[];
  restriction: BookingRestriction | null;
  large_party_redirect: boolean;
  large_party_message: string | null;
}
