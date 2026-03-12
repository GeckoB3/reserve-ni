-- Reserve NI: Table snapping / joining columns
-- Allows tables to be visually snapped together on the floor plan.

ALTER TABLE venue_tables
  ADD COLUMN IF NOT EXISTS snap_group_id uuid,
  ADD COLUMN IF NOT EXISTS snap_sides jsonb;

CREATE INDEX IF NOT EXISTS idx_venue_tables_snap_group
  ON venue_tables (snap_group_id) WHERE snap_group_id IS NOT NULL;
