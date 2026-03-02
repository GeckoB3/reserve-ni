/**
 * Availability engine types. Schemas for venue availability_config and
 * opening_hours JSONB, and results from getAvailableSlots.
 */

/** Day of week 0=Sunday, 1=Monday, ..., 6=Saturday (matches JS Date.getDay()) */
export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6;

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
  /** Max covers per slot, by day of week. Key "0"=Sun .. "6"=Sat. Default if missing: use first value or 0. */
  max_covers_by_day?: Partial<Record<string, number>>;
  turn_time_enabled?: boolean;
  /** 60–180, default 90. Only when turn_time_enabled. */
  sitting_duration_minutes?: number;
}

/** One named sitting with start/end and max covers. */
export interface NamedSitting {
  id: string;
  name: string;
  start_time: string; // "HH:mm"
  end_time: string;   // "HH:mm"
  max_covers: number;
  /** Optional: max covers per day of week "0".."6". */
  max_covers_by_day?: Partial<Record<string, number>>;
}

/** Named-sittings model: venue defines sittings; guests book into a sitting. */
export interface NamedSittingsConfig {
  model: 'named_sittings';
  sittings: NamedSitting[];
}

/** Blocked slot: specific date and optional time range. If no times, whole day. */
export interface BlockedSlot {
  date: string;       // YYYY-MM-DD
  start_time?: string; // "HH:mm" — if omitted, whole day blocked
  end_time?: string;   // "HH:mm"
}

export type AvailabilityConfig =
  | (FixedIntervalsConfig & { blocked_dates?: string[]; blocked_slots?: BlockedSlot[] })
  | (NamedSittingsConfig & { blocked_dates?: string[]; blocked_slots?: BlockedSlot[] });

/** Venue shape needed by the availability engine (subset of DB row). */
export interface VenueForAvailability {
  id: string;
  opening_hours: OpeningHours | null;
  availability_config: AvailabilityConfig | null;
  timezone: string;
}

/** Booking shape needed for capacity (subset of DB row). */
export interface BookingForAvailability {
  id: string;
  booking_date: string;  // YYYY-MM-DD
  booking_time: string;  // "HH:mm" or "HH:mm:ss"
  party_size: number;
  status: string;
}

/** One available slot or sitting returned to the client. */
export interface AvailableSlot {
  /** For fixed intervals: "HH:mm". For named sittings: sitting id. */
  key: string;
  /** Display label: time or sitting name */
  label: string;
  start_time: string;
  end_time: string;
  available_covers: number;
  /** For named sittings, the sitting id for booking. */
  sitting_id?: string;
}
