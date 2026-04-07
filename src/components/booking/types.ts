import type { BookingModel } from '@/types/booking-models';

export type OpeningHourDay =
  | { closed: true }
  | { periods: { open: string; close: string }[] };

export type OpeningHours = Record<string, OpeningHourDay>;

export interface VenuePublic {
  id: string;
  name: string;
  slug: string;
  cover_photo_url: string | null;
  address: string | null;
  phone: string | null;
  /** Business website; shown in booking header when set. */
  website_url?: string | null;
  deposit_config: DepositConfigPublic | null;
  booking_rules: BookingRulesPublic | null;
  opening_hours: OpeningHours | null;
  timezone: string;
  booking_model?: string;
  /** Normalised secondary models (C/D/E); from `venues.enabled_models`. */
  enabled_models?: BookingModel[];
  terminology?: { client: string; booking: string; staff: string };
  currency?: string;
}

export interface DepositConfigPublic {
  enabled: boolean;
  amount_per_person_gbp: number;
  online_requires_deposit?: boolean;
  min_party_size_for_deposit?: number;
  weekend_only?: boolean;
}

export interface BookingRulesPublic {
  min_party_size: number;
  max_party_size: number;
  /** Model B: hours before appointment start to cancel for deposit refund */
  cancellation_notice_hours?: number;
  allow_same_day_booking?: boolean;
}

export interface AvailableSlot {
  key: string;
  label: string;
  start_time: string;
  end_time: string;
  available_covers: number;
  sitting_id?: string;
  service_name?: string;
  service_id?: string;
  estimated_duration?: number;
  deposit_required?: boolean;
  deposit_amount?: number | null;
  /** When deposits apply for this dining service, require them for online/widget checkout. */
  online_requires_deposit?: boolean;
  limited?: boolean;
  available_bookings?: number;
}

export interface ServiceGroup {
  id: string;
  name: string;
  slots: AvailableSlot[];
  large_party_redirect?: boolean;
  large_party_message?: string | null;
}

export interface AvailabilityResponse {
  date: string;
  venue_id: string;
  slots: AvailableSlot[];
  services?: ServiceGroup[];
  large_party_redirect?: boolean;
  large_party_message?: string | null;
}

export interface GuestDetails {
  name: string;
  email: string;
  phone: string;
  dietary_notes?: string;
  occasion?: string;
}

export type BookingStep = 'date' | 'slot' | 'details' | 'payment' | 'confirmation';
