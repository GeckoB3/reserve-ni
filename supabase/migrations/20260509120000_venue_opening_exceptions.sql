-- Per-date opening overrides for unified / appointment venues (closed or reduced hours).
-- Stored as JSON array; restaurant venues continue to use availability_blocks.

ALTER TABLE venues
  ADD COLUMN IF NOT EXISTS venue_opening_exceptions jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN venues.venue_opening_exceptions IS
  'Array of { id, date_start, date_end, closed, periods?, reason? } for venue-wide date exceptions (appointment/unified scheduling).';
