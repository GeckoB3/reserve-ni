-- C/D/E scheduling flexibility: resource date exceptions, class bi-weekly slots

ALTER TABLE venue_resources
  ADD COLUMN IF NOT EXISTS availability_exceptions jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN venue_resources.availability_exceptions IS
  'Per-date overrides: { "YYYY-MM-DD": { "closed": true } } or { "periods": [{ "start": "HH:mm", "end": "HH:mm" }] }';

ALTER TABLE class_timetable
  ADD COLUMN IF NOT EXISTS interval_weeks int NOT NULL DEFAULT 1
    CHECK (interval_weeks >= 1 AND interval_weeks <= 8);

COMMENT ON COLUMN class_timetable.interval_weeks IS
  'Repeat every N weeks for this slot (1 = weekly, 2 = bi-weekly). Used by generate-instances.';
