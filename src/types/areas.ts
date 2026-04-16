/** Dining area (restaurant section) — `areas` table. */
export interface VenueArea {
  id: string;
  venue_id: string;
  name: string;
  description: string | null;
  sort_order: number;
  is_active: boolean;
  colour: string;
  booking_rules: unknown;
  availability_config: unknown;
  communication_templates: unknown;
  deposit_config: unknown;
  created_at: string;
  updated_at: string;
}
