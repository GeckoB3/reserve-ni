-- Polygon table shape support.
-- polygon_points stores normalised vertices (0–100% of bounding box) as JSONB.
-- Also adds the new 'polygon' value to the shape check constraint if one exists.

ALTER TABLE venue_tables
  ADD COLUMN IF NOT EXISTS polygon_points jsonb;

ALTER TABLE floor_plan_table_positions
  ADD COLUMN IF NOT EXISTS polygon_points jsonb;

-- Drop existing shape check constraint (if any) and recreate with 'polygon' included.
-- The shape column has no explicit constraint in the base migration, so this is a no-op
-- if none exists; it is safe to run regardless.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'venue_tables_shape_check'
  ) THEN
    ALTER TABLE venue_tables DROP CONSTRAINT venue_tables_shape_check;
  END IF;
END
$$;

ALTER TABLE venue_tables
  ADD CONSTRAINT venue_tables_shape_check
  CHECK (shape IN ('rectangle', 'square', 'circle', 'oval', 'l-shape', 'polygon'));
