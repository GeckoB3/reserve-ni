-- Multi-area support for table-reservation venues: areas table, FKs, Main Dining backfill, RLS, Realtime.

-- -----------------------------------------------------------------------------
-- 1) Venue-level public booking behaviour (guest-facing)
-- -----------------------------------------------------------------------------
ALTER TABLE venues
  ADD COLUMN IF NOT EXISTS public_booking_area_mode text NOT NULL DEFAULT 'auto'
    CHECK (public_booking_area_mode IN ('auto', 'manual'));

COMMENT ON COLUMN venues.public_booking_area_mode IS
  'Restaurant public booking: auto = combined availability across areas; manual = guest picks area before date/time.';

-- -----------------------------------------------------------------------------
-- 2) areas
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS areas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES venues (id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(trim(name)) > 0),
  description text,
  sort_order int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  colour text NOT NULL DEFAULT '#6366F1',
  booking_rules jsonb,
  availability_config jsonb,
  communication_templates jsonb,
  deposit_config jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT areas_venue_name_unique UNIQUE (venue_id, name)
);

CREATE INDEX IF NOT EXISTS idx_areas_venue_sort ON areas (venue_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_areas_venue_active ON areas (venue_id, is_active) WHERE is_active = true;

COMMENT ON TABLE areas IS
  'Dining section (Main Restaurant, Bar, …) for table_reservation. Single-area venues have one row; settings JSON mirrors venues for that area.';

-- -----------------------------------------------------------------------------
-- 3) Nullable area_id FKs (before backfill)
-- -----------------------------------------------------------------------------
ALTER TABLE venue_services
  ADD COLUMN IF NOT EXISTS area_id uuid REFERENCES areas (id) ON DELETE CASCADE;

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS area_id uuid REFERENCES areas (id) ON DELETE RESTRICT;

ALTER TABLE venue_tables
  ADD COLUMN IF NOT EXISTS area_id uuid REFERENCES areas (id) ON DELETE CASCADE;

ALTER TABLE table_combinations
  ADD COLUMN IF NOT EXISTS area_id uuid REFERENCES areas (id) ON DELETE CASCADE;

ALTER TABLE floor_plans
  ADD COLUMN IF NOT EXISTS area_id uuid REFERENCES areas (id) ON DELETE CASCADE;

ALTER TABLE combination_auto_overrides
  ADD COLUMN IF NOT EXISTS area_id uuid REFERENCES areas (id) ON DELETE CASCADE;

ALTER TABLE availability_blocks
  ADD COLUMN IF NOT EXISTS area_id uuid REFERENCES areas (id) ON DELETE CASCADE;

-- -----------------------------------------------------------------------------
-- 4) Main Dining: one area per venue that uses dining / table booking
-- -----------------------------------------------------------------------------
WITH target_venues AS (
  SELECT DISTINCT v.id
  FROM venues v
  WHERE v.booking_model = 'table_reservation'
     OR (v.active_booking_models IS NOT NULL AND v.active_booking_models @> '["table_reservation"]'::jsonb)
     OR EXISTS (SELECT 1 FROM venue_services vs WHERE vs.venue_id = v.id)
     OR EXISTS (SELECT 1 FROM venue_tables vt WHERE vt.venue_id = v.id)
     OR EXISTS (SELECT 1 FROM table_combinations tc WHERE tc.venue_id = v.id)
     OR EXISTS (SELECT 1 FROM floor_plans fp WHERE fp.venue_id = v.id)
     OR EXISTS (SELECT 1 FROM bookings b WHERE b.venue_id = v.id AND b.booking_model = 'table_reservation')
)
INSERT INTO areas (
  venue_id, name, description, sort_order, is_active, colour,
  booking_rules, availability_config, communication_templates, deposit_config
)
SELECT
  v.id,
  'Main Dining',
  NULL,
  0,
  true,
  '#6366F1',
  v.booking_rules,
  v.availability_config,
  COALESCE(v.communication_templates, '{}'::jsonb),
  v.deposit_config
FROM venues v
JOIN target_venues t ON t.id = v.id
WHERE NOT EXISTS (SELECT 1 FROM areas a WHERE a.venue_id = v.id);

-- Safety: any venue with dining rows but no area yet
INSERT INTO areas (
  venue_id, name, description, sort_order, is_active, colour,
  booking_rules, availability_config, communication_templates, deposit_config
)
SELECT
  v.id,
  'Main Dining',
  NULL,
  0,
  true,
  '#6366F1',
  v.booking_rules,
  v.availability_config,
  COALESCE(v.communication_templates, '{}'::jsonb),
  v.deposit_config
FROM venues v
WHERE NOT EXISTS (SELECT 1 FROM areas a WHERE a.venue_id = v.id)
  AND (
    EXISTS (SELECT 1 FROM venue_services vs WHERE vs.venue_id = v.id)
    OR EXISTS (SELECT 1 FROM venue_tables vt WHERE vt.venue_id = v.id)
    OR EXISTS (SELECT 1 FROM bookings b WHERE b.venue_id = v.id AND b.booking_model = 'table_reservation')
  );

-- -----------------------------------------------------------------------------
-- 5) Backfill FKs
-- -----------------------------------------------------------------------------
UPDATE venue_services vs
SET area_id = a.id
FROM areas a
WHERE vs.venue_id = a.venue_id
  AND a.name = 'Main Dining'
  AND vs.area_id IS NULL;

UPDATE venue_tables vt
SET area_id = a.id
FROM areas a
WHERE vt.venue_id = a.venue_id
  AND a.name = 'Main Dining'
  AND vt.area_id IS NULL;

UPDATE table_combinations tc
SET area_id = a.id
FROM areas a
WHERE tc.venue_id = a.venue_id
  AND a.name = 'Main Dining'
  AND tc.area_id IS NULL;

UPDATE floor_plans fp
SET area_id = a.id
FROM areas a
WHERE fp.venue_id = a.venue_id
  AND a.name = 'Main Dining'
  AND fp.area_id IS NULL;

UPDATE combination_auto_overrides cao
SET area_id = a.id
FROM areas a
WHERE cao.venue_id = a.venue_id
  AND a.name = 'Main Dining'
  AND cao.area_id IS NULL;

UPDATE bookings b
SET area_id = a.id
FROM areas a
WHERE b.venue_id = a.venue_id
  AND a.name = 'Main Dining'
  AND b.booking_model = 'table_reservation'
  AND b.area_id IS NULL;

UPDATE availability_blocks ab
SET area_id = vs.area_id
FROM venue_services vs
WHERE ab.service_id = vs.id
  AND ab.area_id IS NULL
  AND vs.area_id IS NOT NULL;

-- Fallback: assign first area per venue where still null (should be rare)
UPDATE venue_services vs
SET area_id = (SELECT a.id FROM areas a WHERE a.venue_id = vs.venue_id ORDER BY a.sort_order, a.created_at LIMIT 1)
WHERE vs.area_id IS NULL;

UPDATE venue_tables vt
SET area_id = (SELECT a.id FROM areas a WHERE a.venue_id = vt.venue_id ORDER BY a.sort_order, a.created_at LIMIT 1)
WHERE vt.area_id IS NULL;

UPDATE table_combinations tc
SET area_id = (SELECT a.id FROM areas a WHERE a.venue_id = tc.venue_id ORDER BY a.sort_order, a.created_at LIMIT 1)
WHERE tc.area_id IS NULL;

UPDATE floor_plans fp
SET area_id = (SELECT a.id FROM areas a WHERE a.venue_id = fp.venue_id ORDER BY a.sort_order, a.created_at LIMIT 1)
WHERE fp.area_id IS NULL;

UPDATE combination_auto_overrides cao
SET area_id = (SELECT a.id FROM areas a WHERE a.venue_id = cao.venue_id ORDER BY a.sort_order, a.created_at LIMIT 1)
WHERE cao.area_id IS NULL;

UPDATE bookings b
SET area_id = (SELECT a.id FROM areas a WHERE a.venue_id = b.venue_id ORDER BY a.sort_order, a.created_at LIMIT 1)
WHERE b.booking_model = 'table_reservation'
  AND b.area_id IS NULL;

-- -----------------------------------------------------------------------------
-- 6) combination_auto_overrides: replace venue-only unique with (venue, area, key)
-- -----------------------------------------------------------------------------
ALTER TABLE combination_auto_overrides
  DROP CONSTRAINT IF EXISTS combination_auto_overrides_venue_key;

CREATE UNIQUE INDEX IF NOT EXISTS combination_auto_overrides_venue_area_group_key_uq
  ON combination_auto_overrides (venue_id, area_id, table_group_key);

-- -----------------------------------------------------------------------------
-- 7) table_combinations: unique partial index includes area
-- -----------------------------------------------------------------------------
DROP INDEX IF EXISTS table_combinations_venue_group_key_unique;

CREATE UNIQUE INDEX IF NOT EXISTS table_combinations_venue_area_group_key_unique
  ON table_combinations (venue_id, area_id, table_group_key)
  WHERE table_group_key IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 8) venue_tables: names unique per (venue, area) not just venue
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  cname text;
BEGIN
  SELECT con.conname INTO cname
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  WHERE rel.relname = 'venue_tables'
    AND con.contype = 'u'
    AND pg_get_constraintdef(con.oid) LIKE '%venue_id%'
    AND pg_get_constraintdef(con.oid) LIKE '%name%'
  LIMIT 1;
  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE venue_tables DROP CONSTRAINT %I', cname);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS venue_tables_venue_area_name_uq
  ON venue_tables (venue_id, area_id, name);

-- -----------------------------------------------------------------------------
-- 9) NOT NULL where every row has been backfilled
-- -----------------------------------------------------------------------------
ALTER TABLE venue_services
  ALTER COLUMN area_id SET NOT NULL;

ALTER TABLE venue_tables
  ALTER COLUMN area_id SET NOT NULL;

ALTER TABLE table_combinations
  ALTER COLUMN area_id SET NOT NULL;

ALTER TABLE floor_plans
  ALTER COLUMN area_id SET NOT NULL;

ALTER TABLE combination_auto_overrides
  ALTER COLUMN area_id SET NOT NULL;

-- Bookings: only table_reservation must have area (others stay null)
ALTER TABLE bookings
  ADD CONSTRAINT bookings_area_required_for_table_reservation
  CHECK (
    booking_model::text <> 'table_reservation'
    OR area_id IS NOT NULL
  );

-- -----------------------------------------------------------------------------
-- 10) Indexes for area_id
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_venue_services_area ON venue_services (area_id);
CREATE INDEX IF NOT EXISTS idx_bookings_area ON bookings (venue_id, area_id) WHERE area_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_venue_tables_area ON venue_tables (area_id);
CREATE INDEX IF NOT EXISTS idx_table_combinations_area ON table_combinations (area_id);
CREATE INDEX IF NOT EXISTS idx_floor_plans_area ON floor_plans (area_id);
CREATE INDEX IF NOT EXISTS idx_combination_auto_overrides_area ON combination_auto_overrides (area_id);
CREATE INDEX IF NOT EXISTS idx_availability_blocks_area ON availability_blocks (area_id) WHERE area_id IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 11) RLS: areas
-- -----------------------------------------------------------------------------
ALTER TABLE areas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff_select_areas" ON areas;
CREATE POLICY "staff_select_areas"
  ON areas FOR SELECT
  USING (
    venue_id IN (
      SELECT venue_id FROM staff WHERE email = (auth.jwt() ->> 'email')
    )
  );

DROP POLICY IF EXISTS "staff_manage_areas" ON areas;
CREATE POLICY "staff_manage_areas"
  ON areas FOR ALL
  USING (
    venue_id IN (
      SELECT venue_id FROM staff WHERE email = (auth.jwt() ->> 'email')
    )
  )
  WITH CHECK (
    venue_id IN (
      SELECT venue_id FROM staff WHERE email = (auth.jwt() ->> 'email')
    )
  );

DROP POLICY IF EXISTS "service_role_areas" ON areas;
CREATE POLICY "service_role_areas"
  ON areas FOR ALL TO service_role USING (true) WITH CHECK (true);

-- -----------------------------------------------------------------------------
-- 12) Realtime
-- -----------------------------------------------------------------------------
ALTER PUBLICATION supabase_realtime ADD TABLE areas;
