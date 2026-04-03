-- Optional: expose unified scheduling + SMS tables to Supabase Realtime (dashboard live updates).
-- Safe to run once; if a table is already in the publication, Postgres may error - skip or comment that line.

ALTER PUBLICATION supabase_realtime ADD TABLE unified_calendars;
ALTER PUBLICATION supabase_realtime ADD TABLE service_items;
ALTER PUBLICATION supabase_realtime ADD TABLE calendar_service_assignments;
ALTER PUBLICATION supabase_realtime ADD TABLE calendar_blocks;
ALTER PUBLICATION supabase_realtime ADD TABLE event_sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE sms_usage;
ALTER PUBLICATION supabase_realtime ADD TABLE sms_log;
