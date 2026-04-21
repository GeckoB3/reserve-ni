-- Allow staff to "lock" an auto combination so it stays in the catalog and booking logic
-- when the adjacency list changes (e.g. combination threshold update).

ALTER TABLE combination_auto_overrides
  ADD COLUMN IF NOT EXISTS locked boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN combination_auto_overrides.locked IS
  'When true, this group is kept for catalog and suggestions even if it is no longer auto-adjacent.';
