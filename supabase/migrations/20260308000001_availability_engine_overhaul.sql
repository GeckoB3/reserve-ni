-- Reserve NI: Availability Engine Overhaul
-- Adds service-based capacity management with dual-constraint yield management.

-- =============================================================================
-- ENUMS
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'block_type') THEN
    CREATE TYPE block_type AS ENUM ('closed', 'reduced_capacity', 'special_event');
  END IF;
END $$;

-- =============================================================================
-- TABLES
-- =============================================================================

-- venue_services: Named service periods (e.g. Lunch, Dinner) per venue.
CREATE TABLE venue_services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES venues (id) ON DELETE CASCADE,
  name text NOT NULL,
  days_of_week int[] NOT NULL DEFAULT '{1,2,3,4,5,6}',
  start_time time NOT NULL,
  end_time time NOT NULL,
  last_booking_time time NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_venue_services_venue ON venue_services (venue_id);
CREATE INDEX idx_venue_services_active ON venue_services (venue_id, is_active);

-- service_capacity_rules: Yield management rules per service.
-- Rows with day_of_week or time_range set are overrides; NULL = default rule.
CREATE TABLE service_capacity_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id uuid NOT NULL REFERENCES venue_services (id) ON DELETE CASCADE,
  max_covers_per_slot int NOT NULL DEFAULT 20,
  max_bookings_per_slot int NOT NULL DEFAULT 10,
  slot_interval_minutes int NOT NULL DEFAULT 15,
  buffer_minutes int NOT NULL DEFAULT 15,
  day_of_week int,
  time_range_start time,
  time_range_end time,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_capacity_rules_service ON service_capacity_rules (service_id);

-- party_size_durations: Maps party size ranges to dining durations per service.
CREATE TABLE party_size_durations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id uuid NOT NULL REFERENCES venue_services (id) ON DELETE CASCADE,
  min_party_size int NOT NULL,
  max_party_size int NOT NULL,
  duration_minutes int NOT NULL,
  day_of_week int,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_party_durations_service ON party_size_durations (service_id);

-- booking_restrictions: Controls on when/how bookings can be placed per service.
CREATE TABLE booking_restrictions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id uuid NOT NULL REFERENCES venue_services (id) ON DELETE CASCADE,
  min_advance_minutes int NOT NULL DEFAULT 60,
  max_advance_days int NOT NULL DEFAULT 60,
  min_party_size_online int NOT NULL DEFAULT 1,
  max_party_size_online int NOT NULL DEFAULT 10,
  large_party_threshold int,
  large_party_message text,
  deposit_required_from_party_size int,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_booking_restrictions_service ON booking_restrictions (service_id);

-- availability_blocks: Manual overrides and closures.
CREATE TABLE availability_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES venues (id) ON DELETE CASCADE,
  service_id uuid REFERENCES venue_services (id) ON DELETE CASCADE,
  block_type block_type NOT NULL DEFAULT 'closed',
  date_start date NOT NULL,
  date_end date NOT NULL,
  time_start time,
  time_end time,
  override_max_covers int,
  reason text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_availability_blocks_venue ON availability_blocks (venue_id);
CREATE INDEX idx_availability_blocks_dates ON availability_blocks (venue_id, date_start, date_end);

-- =============================================================================
-- ALTER BOOKINGS
-- =============================================================================

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS service_id uuid REFERENCES venue_services (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS estimated_end_time timestamptz,
  ADD COLUMN IF NOT EXISTS actual_seated_time timestamptz,
  ADD COLUMN IF NOT EXISTS actual_departed_time timestamptz;

CREATE INDEX IF NOT EXISTS idx_bookings_service ON bookings (service_id) WHERE service_id IS NOT NULL;

-- =============================================================================
-- ROW-LEVEL SECURITY
-- =============================================================================

ALTER TABLE venue_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_capacity_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE party_size_durations ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_restrictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE availability_blocks ENABLE ROW LEVEL SECURITY;

-- venue_services: staff can manage services for their venue(s)
CREATE POLICY "staff_manage_venue_services"
  ON venue_services FOR ALL
  USING (
    venue_id IN (
      SELECT venue_id FROM staff
      WHERE email = (auth.jwt() ->> 'email')
    )
  )
  WITH CHECK (
    venue_id IN (
      SELECT venue_id FROM staff
      WHERE email = (auth.jwt() ->> 'email')
    )
  );

-- service_capacity_rules: staff can manage via service -> venue chain
CREATE POLICY "staff_manage_capacity_rules"
  ON service_capacity_rules FOR ALL
  USING (
    service_id IN (
      SELECT vs.id FROM venue_services vs
      JOIN staff s ON s.venue_id = vs.venue_id
      WHERE s.email = (auth.jwt() ->> 'email')
    )
  )
  WITH CHECK (
    service_id IN (
      SELECT vs.id FROM venue_services vs
      JOIN staff s ON s.venue_id = vs.venue_id
      WHERE s.email = (auth.jwt() ->> 'email')
    )
  );

-- party_size_durations: staff can manage via service -> venue chain
CREATE POLICY "staff_manage_party_durations"
  ON party_size_durations FOR ALL
  USING (
    service_id IN (
      SELECT vs.id FROM venue_services vs
      JOIN staff s ON s.venue_id = vs.venue_id
      WHERE s.email = (auth.jwt() ->> 'email')
    )
  )
  WITH CHECK (
    service_id IN (
      SELECT vs.id FROM venue_services vs
      JOIN staff s ON s.venue_id = vs.venue_id
      WHERE s.email = (auth.jwt() ->> 'email')
    )
  );

-- booking_restrictions: staff can manage via service -> venue chain
CREATE POLICY "staff_manage_booking_restrictions"
  ON booking_restrictions FOR ALL
  USING (
    service_id IN (
      SELECT vs.id FROM venue_services vs
      JOIN staff s ON s.venue_id = vs.venue_id
      WHERE s.email = (auth.jwt() ->> 'email')
    )
  )
  WITH CHECK (
    service_id IN (
      SELECT vs.id FROM venue_services vs
      JOIN staff s ON s.venue_id = vs.venue_id
      WHERE s.email = (auth.jwt() ->> 'email')
    )
  );

-- availability_blocks: staff can manage for their venue(s)
CREATE POLICY "staff_manage_availability_blocks"
  ON availability_blocks FOR ALL
  USING (
    venue_id IN (
      SELECT venue_id FROM staff
      WHERE email = (auth.jwt() ->> 'email')
    )
  )
  WITH CHECK (
    venue_id IN (
      SELECT venue_id FROM staff
      WHERE email = (auth.jwt() ->> 'email')
    )
  );

-- Public read access for venue_services (needed by booking page)
CREATE POLICY "public_read_venue_services"
  ON venue_services FOR SELECT
  TO anon
  USING (is_active = true);

-- Public read for service_capacity_rules (needed by availability engine)
CREATE POLICY "public_read_capacity_rules"
  ON service_capacity_rules FOR SELECT
  TO anon
  USING (true);

-- Public read for party_size_durations
CREATE POLICY "public_read_party_durations"
  ON party_size_durations FOR SELECT
  TO anon
  USING (true);

-- Public read for booking_restrictions
CREATE POLICY "public_read_booking_restrictions"
  ON booking_restrictions FOR SELECT
  TO anon
  USING (true);

-- Public read for availability_blocks (needed by availability engine)
CREATE POLICY "public_read_availability_blocks"
  ON availability_blocks FOR SELECT
  TO anon
  USING (true);

-- =============================================================================
-- WAITLIST
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'waitlist_status') THEN
    CREATE TYPE waitlist_status AS ENUM ('waiting', 'offered', 'confirmed', 'expired', 'cancelled');
  END IF;
END $$;

CREATE TABLE waitlist_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES venues (id) ON DELETE CASCADE,
  service_id uuid REFERENCES venue_services (id) ON DELETE SET NULL,
  desired_date date NOT NULL,
  desired_time time,
  party_size int NOT NULL,
  guest_name text NOT NULL,
  guest_email text,
  guest_phone text NOT NULL,
  status waitlist_status NOT NULL DEFAULT 'waiting',
  offered_at timestamptz,
  expires_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_waitlist_venue_date ON waitlist_entries (venue_id, desired_date);
CREATE INDEX idx_waitlist_status ON waitlist_entries (venue_id, status);

ALTER TABLE waitlist_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_manage_waitlist"
  ON waitlist_entries FOR ALL
  USING (
    venue_id IN (
      SELECT venue_id FROM staff
      WHERE email = (auth.jwt() ->> 'email')
    )
  )
  WITH CHECK (
    venue_id IN (
      SELECT venue_id FROM staff
      WHERE email = (auth.jwt() ->> 'email')
    )
  );

CREATE POLICY "public_insert_waitlist"
  ON waitlist_entries FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "public_read_own_waitlist"
  ON waitlist_entries FOR SELECT
  TO anon
  USING (true);
