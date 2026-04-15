-- Per-seat angle overrides for custom seat placement.
-- seat_angles is a JSON array of numbers (radians) indexed by seat position.
-- null at any index means "use computed default position".

ALTER TABLE venue_tables
  ADD COLUMN IF NOT EXISTS seat_angles jsonb;

ALTER TABLE floor_plan_table_positions
  ADD COLUMN IF NOT EXISTS seat_angles jsonb;
