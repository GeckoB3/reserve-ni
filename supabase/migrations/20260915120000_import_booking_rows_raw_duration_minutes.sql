-- Staging: remember whether duration came from the CSV vs defaults (for applying catalogue duration on execute).

ALTER TABLE import_booking_rows
  ADD COLUMN IF NOT EXISTS raw_duration_minutes text;

COMMENT ON COLUMN import_booking_rows.raw_duration_minutes IS
  'Trimmed CSV cell when Duration column is mapped; null means unmapped/empty so execute may apply service duration.';
