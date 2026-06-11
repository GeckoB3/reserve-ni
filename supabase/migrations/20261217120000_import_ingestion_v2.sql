-- Import ingestion v2: spreadsheet support + full-file column profiling.
-- column_profile: deterministic per-column stats (fill rate, type counts,
--   date-order evidence) computed at upload; powers AI mapping context and
--   automatic DD/MM vs MM/DD inference.
-- header_row_index: 0-based row where the real header was detected in the
--   original file (rows above were title/metadata junk and were dropped).

ALTER TABLE import_files
  ADD COLUMN IF NOT EXISTS column_profile jsonb,
  ADD COLUMN IF NOT EXISTS header_row_index int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS source_sheet_name text,
  ADD COLUMN IF NOT EXISTS ingest_warnings jsonb;
