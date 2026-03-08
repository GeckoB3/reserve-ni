export interface VenuePublic {
  id: string;
  name: string;
  slug: string;
  cover_photo_url: string | null;
  address: string | null;
  phone: string | null;
  deposit_config: DepositConfigPublic | null;
  booking_rules: BookingRulesPublic | null;
  timezone: string;
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
