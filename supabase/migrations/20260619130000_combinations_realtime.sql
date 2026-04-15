-- Expose combination tables to Supabase Realtime (dashboard Combinations tab live sync).
-- If a table is already in the publication, apply manually and skip the failing line.

ALTER PUBLICATION supabase_realtime ADD TABLE table_combinations;
ALTER PUBLICATION supabase_realtime ADD TABLE combination_auto_overrides;
