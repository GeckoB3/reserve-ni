-- Per-floor-plan canvas dimensions.
-- NULL = auto-compute from viewport (legacy behaviour).
-- Non-null values override the logical layout size so venues can set a fixed room footprint.

ALTER TABLE floor_plans
  ADD COLUMN IF NOT EXISTS canvas_width  float8,
  ADD COLUMN IF NOT EXISTS canvas_height float8;
