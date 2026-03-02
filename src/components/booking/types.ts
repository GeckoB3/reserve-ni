export interface VenuePublic {
  id: string;
  name: string;
  slug: string;
  cover_photo_url: string | null;
  deposit_config: DepositConfigPublic | null;
  booking_rules: BookingRulesPublic | null;
  timezone: string;
}

export interface DepositConfigPublic {
  enabled: boolean;
  amount_per_person_gbp: number;
  online_requires_deposit?: boolean;
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
}

export interface GuestDetails {
  name: string;
  email: string;
  phone: string;
  dietary_notes?: string;
  occasion?: string;
}

export type BookingStep = 'date' | 'slot' | 'details' | 'payment' | 'confirmation';
