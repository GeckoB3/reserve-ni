/** Venue shape used by the settings dashboard (matches API). */
export interface VenueSettings {
  id: string;
  name: string;
  slug: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  cover_photo_url: string | null;
  opening_hours: OpeningHoursSettings | null;
  booking_rules: BookingRulesSettings | null;
  deposit_config: DepositConfigSettings | null;
  availability_config: AvailabilityConfigSettings | null;
  timezone: string;
}

export type OpeningHoursDaySettings =
  | { closed: true }
  | { periods: { open: string; close: string }[] };

export type OpeningHoursSettings = Record<string, OpeningHoursDaySettings>;

export interface BookingRulesSettings {
  min_party_size: number;
  max_party_size: number;
  max_advance_booking_days: number;
  min_notice_hours: number;
}

export interface DepositConfigSettings {
  enabled: boolean;
  amount_per_person_gbp: number;
  online_requires_deposit: boolean;
  phone_requires_deposit: boolean;
}

export interface FixedIntervalsSettings {
  model: 'fixed_intervals';
  interval_minutes: 15 | 30;
  max_covers_by_day?: Record<string, number>;
  turn_time_enabled?: boolean;
  sitting_duration_minutes?: number;
  blocked_dates?: string[];
  blocked_slots?: { date: string; start_time?: string; end_time?: string }[];
}

export interface NamedSittingSettings {
  id: string;
  name: string;
  start_time: string;
  end_time: string;
  max_covers: number;
  max_covers_by_day?: Record<string, number>;
}

export interface NamedSittingsSettings {
  model: 'named_sittings';
  sittings: NamedSittingSettings[];
  blocked_dates?: string[];
  blocked_slots?: { date: string; start_time?: string; end_time?: string }[];
}

export type AvailabilityConfigSettings = FixedIntervalsSettings | NamedSittingsSettings;

export interface StaffMember {
  id: string;
  email: string;
  name: string | null;
  role: string;
  created_at: string;
}
