-- Multiple named floor plans per venue.
-- A venue can have up to 24 floor plans; positions for each floor plan are stored
-- separately in floor_plan_table_positions so the same table can appear on multiple
-- floor plans with different layouts.

-- ---------------------------------------------------------------------------
-- floor_plans
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS floor_plans (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id     uuid NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  name         text NOT NULL CHECK (char_length(trim(name)) > 0),
  background_url text,
  sort_order   int  NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS floor_plans_venue_id_idx ON floor_plans (venue_id, sort_order);

ALTER TABLE floor_plans ENABLE ROW LEVEL SECURITY;

-- Staff can manage floor plans for their venue; admin enforcement is at API level.
CREATE POLICY "staff_manage_floor_plans"
  ON floor_plans FOR ALL
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

-- ---------------------------------------------------------------------------
-- floor_plan_table_positions
-- ---------------------------------------------------------------------------
-- Per-floor-plan layout overrides. When a row exists, the editor uses its
-- position/size/rotation values instead of the legacy columns on venue_tables.

CREATE TABLE IF NOT EXISTS floor_plan_table_positions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  floor_plan_id  uuid NOT NULL REFERENCES floor_plans(id) ON DELETE CASCADE,
  table_id       uuid NOT NULL REFERENCES venue_tables(id) ON DELETE CASCADE,
  position_x     numeric,
  position_y     numeric,
  width          numeric,
  height         numeric,
  rotation       numeric NOT NULL DEFAULT 0,
  snap_group_id  text,
  snap_sides     text[],
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (floor_plan_id, table_id)
);

CREATE INDEX IF NOT EXISTS floor_plan_positions_floor_plan_id_idx
  ON floor_plan_table_positions (floor_plan_id);

ALTER TABLE floor_plan_table_positions ENABLE ROW LEVEL SECURITY;

-- Staff can manage positions via the floor_plan -> venue chain.
CREATE POLICY "staff_manage_floor_plan_positions"
  ON floor_plan_table_positions FOR ALL
  USING (
    floor_plan_id IN (
      SELECT fp.id FROM floor_plans fp
      JOIN staff s ON s.venue_id = fp.venue_id
      WHERE s.email = (auth.jwt() ->> 'email')
    )
  )
  WITH CHECK (
    floor_plan_id IN (
      SELECT fp.id FROM floor_plans fp
      JOIN staff s ON s.venue_id = fp.venue_id
      WHERE s.email = (auth.jwt() ->> 'email')
    )
  );

-- ---------------------------------------------------------------------------
-- Data migration
-- ---------------------------------------------------------------------------
-- For each venue that already has table positions set on venue_tables, create a
-- "Main" floor plan and copy the existing position data across.
-- The legacy columns on venue_tables are left intact as a safety net.

INSERT INTO floor_plans (venue_id, name, background_url, sort_order)
SELECT DISTINCT
  vt.venue_id,
  'Main',
  v.floor_plan_background_url,
  0
FROM venue_tables vt
JOIN venues v ON v.id = vt.venue_id
WHERE vt.position_x IS NOT NULL
  AND vt.position_y IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM floor_plans fp2 WHERE fp2.venue_id = vt.venue_id
  );

INSERT INTO floor_plan_table_positions
  (floor_plan_id, table_id, position_x, position_y, width, height, rotation, snap_group_id, snap_sides)
SELECT
  fp.id,
  vt.id,
  vt.position_x,
  vt.position_y,
  vt.width,
  vt.height,
  COALESCE(vt.rotation, 0),
  vt.snap_group_id,
  -- venue_tables.snap_sides is jsonb (e.g. ["left","right"]); cast to text[]
  CASE
    WHEN vt.snap_sides IS NULL THEN NULL
    ELSE ARRAY(SELECT jsonb_array_elements_text(vt.snap_sides))
  END
FROM venue_tables vt
JOIN floor_plans fp ON fp.venue_id = vt.venue_id AND fp.name = 'Main'
WHERE vt.position_x IS NOT NULL
  AND vt.position_y IS NOT NULL
ON CONFLICT (floor_plan_id, table_id) DO NOTHING;
