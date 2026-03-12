-- Reserve NI: Table Management
-- Adds optional table-level management on top of the existing covers-based system.
-- When table_management_enabled is false (default), everything works unchanged.

-- =============================================================================
-- VENUE COLUMNS
-- =============================================================================

ALTER TABLE venues
  ADD COLUMN IF NOT EXISTS table_management_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS floor_plan_background_url text,
  ADD COLUMN IF NOT EXISTS auto_bussing_minutes int NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS active_table_statuses text[] NOT NULL DEFAULT '{available,reserved,seated,starters,mains,dessert,bill,paid,bussing}',
  ADD COLUMN IF NOT EXISTS show_table_in_confirmation boolean NOT NULL DEFAULT false;

-- =============================================================================
-- TABLES
-- =============================================================================

-- venue_tables: Physical tables in the restaurant.
CREATE TABLE venue_tables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES venues (id) ON DELETE CASCADE,
  name text NOT NULL,
  min_covers int NOT NULL DEFAULT 1,
  max_covers int NOT NULL DEFAULT 2,
  shape text NOT NULL DEFAULT 'rectangle',
  zone text,
  position_x numeric,
  position_y numeric,
  width numeric DEFAULT 10,
  height numeric DEFAULT 8,
  rotation numeric DEFAULT 0,
  sort_order int NOT NULL DEFAULT 0,
  server_section text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(venue_id, name)
);

-- table_combinations: Defines which tables can be combined for larger parties.
CREATE TABLE table_combinations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES venues (id) ON DELETE CASCADE,
  name text NOT NULL,
  combined_min_covers int NOT NULL,
  combined_max_covers int NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- table_combination_members: Links tables to combinations.
CREATE TABLE table_combination_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  combination_id uuid NOT NULL REFERENCES table_combinations (id) ON DELETE CASCADE,
  table_id uuid NOT NULL REFERENCES venue_tables (id) ON DELETE CASCADE,
  UNIQUE(combination_id, table_id)
);

-- booking_table_assignments: Links bookings to tables.
-- A booking on a combination has one row per component table.
CREATE TABLE booking_table_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES bookings (id) ON DELETE CASCADE,
  table_id uuid NOT NULL REFERENCES venue_tables (id) ON DELETE CASCADE,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  assigned_by uuid REFERENCES staff (id),
  UNIQUE(booking_id, table_id)
);

-- table_statuses: One row per table tracking real-time service status.
CREATE TABLE table_statuses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id uuid NOT NULL REFERENCES venue_tables (id) ON DELETE CASCADE,
  booking_id uuid REFERENCES bookings (id),
  status text NOT NULL DEFAULT 'available',
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES staff (id),
  UNIQUE(table_id)
);

-- =============================================================================
-- INDEXES
-- =============================================================================

CREATE INDEX idx_venue_tables_venue ON venue_tables (venue_id) WHERE is_active = true;
CREATE INDEX idx_venue_tables_venue_all ON venue_tables (venue_id);
CREATE INDEX idx_booking_table_assignments_booking ON booking_table_assignments (booking_id);
CREATE INDEX idx_booking_table_assignments_table ON booking_table_assignments (table_id);
CREATE INDEX idx_table_statuses_table ON table_statuses (table_id);
CREATE INDEX idx_table_combinations_venue ON table_combinations (venue_id) WHERE is_active = true;
CREATE INDEX idx_table_combination_members_combination ON table_combination_members (combination_id);
CREATE INDEX idx_table_combination_members_table ON table_combination_members (table_id);

-- =============================================================================
-- ROW-LEVEL SECURITY
-- =============================================================================

ALTER TABLE venue_tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE table_combinations ENABLE ROW LEVEL SECURITY;
ALTER TABLE table_combination_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_table_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE table_statuses ENABLE ROW LEVEL SECURITY;

-- venue_tables: staff can manage tables for their venue
CREATE POLICY "staff_manage_venue_tables"
  ON venue_tables FOR ALL
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

-- table_combinations: staff can manage via venue_id
CREATE POLICY "staff_manage_table_combinations"
  ON table_combinations FOR ALL
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

-- table_combination_members: staff can manage via combination -> venue chain
CREATE POLICY "staff_manage_combination_members"
  ON table_combination_members FOR ALL
  USING (
    combination_id IN (
      SELECT tc.id FROM table_combinations tc
      JOIN staff s ON s.venue_id = tc.venue_id
      WHERE s.email = (auth.jwt() ->> 'email')
    )
  )
  WITH CHECK (
    combination_id IN (
      SELECT tc.id FROM table_combinations tc
      JOIN staff s ON s.venue_id = tc.venue_id
      WHERE s.email = (auth.jwt() ->> 'email')
    )
  );

-- booking_table_assignments: staff can manage via booking -> venue chain
CREATE POLICY "staff_manage_table_assignments"
  ON booking_table_assignments FOR ALL
  USING (
    booking_id IN (
      SELECT b.id FROM bookings b
      JOIN staff s ON s.venue_id = b.venue_id
      WHERE s.email = (auth.jwt() ->> 'email')
    )
  )
  WITH CHECK (
    booking_id IN (
      SELECT b.id FROM bookings b
      JOIN staff s ON s.venue_id = b.venue_id
      WHERE s.email = (auth.jwt() ->> 'email')
    )
  );

-- table_statuses: staff can manage via table -> venue chain
CREATE POLICY "staff_manage_table_statuses"
  ON table_statuses FOR ALL
  USING (
    table_id IN (
      SELECT vt.id FROM venue_tables vt
      JOIN staff s ON s.venue_id = vt.venue_id
      WHERE s.email = (auth.jwt() ->> 'email')
    )
  )
  WITH CHECK (
    table_id IN (
      SELECT vt.id FROM venue_tables vt
      JOIN staff s ON s.venue_id = vt.venue_id
      WHERE s.email = (auth.jwt() ->> 'email')
    )
  );

-- =============================================================================
-- TRIGGERS
-- =============================================================================

-- Auto-insert a table_statuses row when a venue_table is created
CREATE OR REPLACE FUNCTION fn_auto_create_table_status()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO table_statuses (table_id, status)
  VALUES (NEW.id, 'available')
  ON CONFLICT (table_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_auto_create_table_status
  AFTER INSERT ON venue_tables
  FOR EACH ROW
  EXECUTE FUNCTION fn_auto_create_table_status();

-- Log to events when booking_table_assignments change
CREATE OR REPLACE FUNCTION fn_log_table_assignment_event()
RETURNS TRIGGER AS $$
DECLARE
  v_venue_id uuid;
  v_table_name text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    SELECT vt.venue_id, vt.name INTO v_venue_id, v_table_name
    FROM venue_tables vt WHERE vt.id = OLD.table_id;

    INSERT INTO events (venue_id, booking_id, event_type, payload)
    VALUES (
      v_venue_id,
      OLD.booking_id,
      'booking.table_unassigned',
      jsonb_build_object('table_id', OLD.table_id, 'table_name', v_table_name)
    );
    RETURN OLD;
  END IF;

  SELECT vt.venue_id, vt.name INTO v_venue_id, v_table_name
  FROM venue_tables vt WHERE vt.id = NEW.table_id;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO events (venue_id, booking_id, event_type, payload)
    VALUES (
      v_venue_id,
      NEW.booking_id,
      'booking.table_assigned',
      jsonb_build_object(
        'table_id', NEW.table_id,
        'table_name', v_table_name,
        'assigned_by', NEW.assigned_by,
        'auto', NEW.assigned_by IS NULL
      )
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_log_table_assignment
  AFTER INSERT OR DELETE ON booking_table_assignments
  FOR EACH ROW
  EXECUTE FUNCTION fn_log_table_assignment_event();

-- =============================================================================
-- REALTIME
-- =============================================================================

ALTER PUBLICATION supabase_realtime ADD TABLE table_statuses;
ALTER PUBLICATION supabase_realtime ADD TABLE booking_table_assignments;
