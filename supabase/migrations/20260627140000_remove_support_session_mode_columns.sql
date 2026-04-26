-- Superuser support sessions now always grant the selected staff user's normal access.
-- Keep this as a forward migration in case the earlier mode-based implementation was applied.

ALTER TABLE support_sessions
  DROP COLUMN IF EXISTS mode,
  DROP COLUMN IF EXISTS edit_mode_reason;
