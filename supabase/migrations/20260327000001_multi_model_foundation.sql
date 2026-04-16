-- Reserve NI: Multi-model foundation
-- Adds booking_model, business_type, terminology to venues; extends bookings
-- with model-specific FKs; creates tables for Models B–E.

-- =============================================================================
-- BOOKING MODEL ENUM
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'booking_model') THEN
    CREATE TYPE booking_model AS ENUM (
      'table_reservation',
      'practitioner_appointment',
      'event_ticket',
      'class_session',
      'resource_booking'
    );
  END IF;
END $$;

-- =============================================================================
-- VENUES: add booking model, business metadata, terminology
-- =============================================================================

ALTER TABLE venues
  ADD COLUMN IF NOT EXISTS booking_model booking_model NOT NULL DEFAULT 'table_reservation',
  ADD COLUMN IF NOT EXISTS business_type text,
  ADD COLUMN IF NOT EXISTS business_category text,
  ADD COLUMN IF NOT EXISTS terminology jsonb NOT NULL DEFAULT '{"client":"Guest","booking":"Reservation","staff":"Staff"}'::jsonb;

-- =============================================================================
-- MODEL B: Practitioners + appointment services
-- =============================================================================

CREATE TABLE practitioners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  staff_id uuid REFERENCES staff(id) ON DELETE SET NULL,
  name text NOT NULL,
  email text,
  phone text,
  working_hours jsonb NOT NULL DEFAULT '{}'::jsonb,
  break_times jsonb NOT NULL DEFAULT '[]'::jsonb,
  days_off jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_practitioners_venue ON practitioners (venue_id);
CREATE INDEX idx_practitioners_active ON practitioners (venue_id, is_active);

CREATE TABLE appointment_services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  duration_minutes int NOT NULL,
  buffer_minutes int NOT NULL DEFAULT 0,
  price_pence int,
  deposit_pence int,
  colour text NOT NULL DEFAULT '#3B82F6',
  is_active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_appointment_services_venue ON appointment_services (venue_id);
CREATE INDEX idx_appointment_services_active ON appointment_services (venue_id, is_active);

CREATE TABLE practitioner_services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practitioner_id uuid NOT NULL REFERENCES practitioners(id) ON DELETE CASCADE,
  service_id uuid NOT NULL REFERENCES appointment_services(id) ON DELETE CASCADE,
  custom_duration_minutes int,
  custom_price_pence int,
  UNIQUE(practitioner_id, service_id)
);

CREATE INDEX idx_practitioner_services_practitioner ON practitioner_services (practitioner_id);
CREATE INDEX idx_practitioner_services_service ON practitioner_services (service_id);

-- =============================================================================
-- MODEL C: Experience events + ticket types
-- =============================================================================

CREATE TABLE experience_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  event_date date NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  capacity int NOT NULL,
  image_url text,
  is_recurring boolean NOT NULL DEFAULT false,
  recurrence_rule text,
  parent_event_id uuid REFERENCES experience_events(id) ON DELETE CASCADE,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_experience_events_venue ON experience_events (venue_id);
CREATE INDEX idx_experience_events_date ON experience_events (venue_id, event_date);
CREATE INDEX idx_experience_events_parent ON experience_events (parent_event_id) WHERE parent_event_id IS NOT NULL;

CREATE TABLE event_ticket_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES experience_events(id) ON DELETE CASCADE,
  name text NOT NULL,
  price_pence int NOT NULL,
  capacity int,
  sort_order int NOT NULL DEFAULT 0
);

CREATE INDEX idx_event_ticket_types_event ON event_ticket_types (event_id);

-- =============================================================================
-- MODEL D: Class types, timetable, instances
-- =============================================================================

CREATE TABLE class_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  duration_minutes int NOT NULL,
  capacity int NOT NULL,
  instructor_id uuid REFERENCES practitioners(id) ON DELETE SET NULL,
  price_pence int,
  colour text NOT NULL DEFAULT '#22C55E',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_class_types_venue ON class_types (venue_id);

CREATE TABLE class_timetable (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_type_id uuid NOT NULL REFERENCES class_types(id) ON DELETE CASCADE,
  day_of_week int NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time time NOT NULL,
  is_active boolean NOT NULL DEFAULT true
);

CREATE INDEX idx_class_timetable_class ON class_timetable (class_type_id);

CREATE TABLE class_instances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_type_id uuid NOT NULL REFERENCES class_types(id) ON DELETE CASCADE,
  timetable_entry_id uuid REFERENCES class_timetable(id) ON DELETE SET NULL,
  instance_date date NOT NULL,
  start_time time NOT NULL,
  capacity_override int,
  is_cancelled boolean NOT NULL DEFAULT false,
  cancel_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_class_instances_type ON class_instances (class_type_id);
CREATE INDEX idx_class_instances_date ON class_instances (class_type_id, instance_date);

-- =============================================================================
-- MODEL E: Venue resources
-- =============================================================================

CREATE TABLE venue_resources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  name text NOT NULL,
  resource_type text,
  min_booking_minutes int NOT NULL DEFAULT 60,
  max_booking_minutes int NOT NULL DEFAULT 120,
  slot_interval_minutes int NOT NULL DEFAULT 30,
  price_per_slot_pence int,
  availability_hours jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_venue_resources_venue ON venue_resources (venue_id);
CREATE INDEX idx_venue_resources_active ON venue_resources (venue_id, is_active);

-- =============================================================================
-- BOOKINGS: add model-specific FK columns + ticket lines
-- =============================================================================

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS practitioner_id uuid REFERENCES practitioners(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS appointment_service_id uuid REFERENCES appointment_services(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS experience_event_id uuid REFERENCES experience_events(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS class_instance_id uuid REFERENCES class_instances(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS resource_id uuid REFERENCES venue_resources(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS booking_end_time time;

CREATE INDEX IF NOT EXISTS idx_bookings_practitioner ON bookings (practitioner_id) WHERE practitioner_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bookings_appointment_svc ON bookings (appointment_service_id) WHERE appointment_service_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bookings_experience_event ON bookings (experience_event_id) WHERE experience_event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bookings_class_instance ON bookings (class_instance_id) WHERE class_instance_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bookings_resource ON bookings (resource_id) WHERE resource_id IS NOT NULL;

-- Ticket line items (for event and class bookings with multiple ticket/pricing tiers)
CREATE TABLE booking_ticket_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  ticket_type_id uuid REFERENCES event_ticket_types(id) ON DELETE SET NULL,
  label text NOT NULL,
  quantity int NOT NULL DEFAULT 1,
  unit_price_pence int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_booking_ticket_lines_booking ON booking_ticket_lines (booking_id);

-- =============================================================================
-- ROW-LEVEL SECURITY for new tables
-- =============================================================================

ALTER TABLE practitioners ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointment_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE practitioner_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE experience_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_ticket_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE class_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE class_timetable ENABLE ROW LEVEL SECURITY;
ALTER TABLE class_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE venue_resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_ticket_lines ENABLE ROW LEVEL SECURITY;

-- Staff can manage rows for their venue
CREATE POLICY "staff_manage_practitioners"
  ON practitioners FOR ALL
  USING (venue_id IN (SELECT venue_id FROM staff WHERE email = (auth.jwt() ->> 'email')))
  WITH CHECK (venue_id IN (SELECT venue_id FROM staff WHERE email = (auth.jwt() ->> 'email')));

CREATE POLICY "staff_manage_appointment_services"
  ON appointment_services FOR ALL
  USING (venue_id IN (SELECT venue_id FROM staff WHERE email = (auth.jwt() ->> 'email')))
  WITH CHECK (venue_id IN (SELECT venue_id FROM staff WHERE email = (auth.jwt() ->> 'email')));

CREATE POLICY "staff_manage_practitioner_services"
  ON practitioner_services FOR ALL
  USING (practitioner_id IN (
    SELECT p.id FROM practitioners p
    JOIN staff s ON s.venue_id = p.venue_id
    WHERE s.email = (auth.jwt() ->> 'email')
  ))
  WITH CHECK (practitioner_id IN (
    SELECT p.id FROM practitioners p
    JOIN staff s ON s.venue_id = p.venue_id
    WHERE s.email = (auth.jwt() ->> 'email')
  ));

CREATE POLICY "staff_manage_experience_events"
  ON experience_events FOR ALL
  USING (venue_id IN (SELECT venue_id FROM staff WHERE email = (auth.jwt() ->> 'email')))
  WITH CHECK (venue_id IN (SELECT venue_id FROM staff WHERE email = (auth.jwt() ->> 'email')));

CREATE POLICY "staff_manage_event_ticket_types"
  ON event_ticket_types FOR ALL
  USING (event_id IN (
    SELECT e.id FROM experience_events e
    JOIN staff s ON s.venue_id = e.venue_id
    WHERE s.email = (auth.jwt() ->> 'email')
  ))
  WITH CHECK (event_id IN (
    SELECT e.id FROM experience_events e
    JOIN staff s ON s.venue_id = e.venue_id
    WHERE s.email = (auth.jwt() ->> 'email')
  ));

CREATE POLICY "staff_manage_class_types"
  ON class_types FOR ALL
  USING (venue_id IN (SELECT venue_id FROM staff WHERE email = (auth.jwt() ->> 'email')))
  WITH CHECK (venue_id IN (SELECT venue_id FROM staff WHERE email = (auth.jwt() ->> 'email')));

CREATE POLICY "staff_manage_class_timetable"
  ON class_timetable FOR ALL
  USING (class_type_id IN (
    SELECT ct.id FROM class_types ct
    JOIN staff s ON s.venue_id = ct.venue_id
    WHERE s.email = (auth.jwt() ->> 'email')
  ))
  WITH CHECK (class_type_id IN (
    SELECT ct.id FROM class_types ct
    JOIN staff s ON s.venue_id = ct.venue_id
    WHERE s.email = (auth.jwt() ->> 'email')
  ));

CREATE POLICY "staff_manage_class_instances"
  ON class_instances FOR ALL
  USING (class_type_id IN (
    SELECT ct.id FROM class_types ct
    JOIN staff s ON s.venue_id = ct.venue_id
    WHERE s.email = (auth.jwt() ->> 'email')
  ))
  WITH CHECK (class_type_id IN (
    SELECT ct.id FROM class_types ct
    JOIN staff s ON s.venue_id = ct.venue_id
    WHERE s.email = (auth.jwt() ->> 'email')
  ));

CREATE POLICY "staff_manage_venue_resources"
  ON venue_resources FOR ALL
  USING (venue_id IN (SELECT venue_id FROM staff WHERE email = (auth.jwt() ->> 'email')))
  WITH CHECK (venue_id IN (SELECT venue_id FROM staff WHERE email = (auth.jwt() ->> 'email')));

CREATE POLICY "staff_manage_booking_ticket_lines"
  ON booking_ticket_lines FOR ALL
  USING (booking_id IN (
    SELECT b.id FROM bookings b
    JOIN staff s ON s.venue_id = b.venue_id
    WHERE s.email = (auth.jwt() ->> 'email')
  ))
  WITH CHECK (booking_id IN (
    SELECT b.id FROM bookings b
    JOIN staff s ON s.venue_id = b.venue_id
    WHERE s.email = (auth.jwt() ->> 'email')
  ));

-- Service role bypass policies for admin operations
CREATE POLICY "service_role_practitioners" ON practitioners FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_appointment_services" ON appointment_services FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_practitioner_services" ON practitioner_services FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_experience_events" ON experience_events FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_event_ticket_types" ON event_ticket_types FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_class_types" ON class_types FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_class_timetable" ON class_timetable FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_class_instances" ON class_instances FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_venue_resources" ON venue_resources FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_booking_ticket_lines" ON booking_ticket_lines FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Public read for guest-facing booking pages
CREATE POLICY "public_read_practitioners"
  ON practitioners FOR SELECT TO anon USING (is_active = true);

CREATE POLICY "public_read_appointment_services"
  ON appointment_services FOR SELECT TO anon USING (is_active = true);

CREATE POLICY "public_read_practitioner_services"
  ON practitioner_services FOR SELECT TO anon USING (true);

CREATE POLICY "public_read_experience_events"
  ON experience_events FOR SELECT TO anon USING (is_active = true);

CREATE POLICY "public_read_event_ticket_types"
  ON event_ticket_types FOR SELECT TO anon USING (true);

CREATE POLICY "public_read_class_types"
  ON class_types FOR SELECT TO anon USING (is_active = true);

CREATE POLICY "public_read_class_timetable"
  ON class_timetable FOR SELECT TO anon USING (is_active = true);

CREATE POLICY "public_read_class_instances"
  ON class_instances FOR SELECT TO anon USING (is_cancelled = false);

CREATE POLICY "public_read_venue_resources"
  ON venue_resources FOR SELECT TO anon USING (is_active = true);
