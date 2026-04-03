-- Reserve NI: Nuclear reset - drops ALL app tables, functions, types, and storage.
-- Paste into Supabase SQL Editor and run ONCE, then run supabase-full-schema.sql to rebuild.
--
-- WARNING: This deletes ALL data. There is no undo.

-- =============================================
-- 1. Drop storage policy (storage.objects always exists; app tables handled by CASCADE)
-- =============================================
DROP POLICY IF EXISTS "venue_cover_public_read" ON storage.objects;

-- =============================================
-- 2. Drop tables (CASCADE removes their policies, triggers, and indexes)
-- =============================================
DROP TABLE IF EXISTS communications CASCADE;
DROP TABLE IF EXISTS reconciliation_alerts CASCADE;
DROP TABLE IF EXISTS webhook_events CASCADE;
DROP TABLE IF EXISTS events CASCADE;
DROP TABLE IF EXISTS bookings CASCADE;
DROP TABLE IF EXISTS guests CASCADE;
DROP TABLE IF EXISTS staff CASCADE;
DROP TABLE IF EXISTS venues CASCADE;

-- =============================================
-- 4. Drop functions
-- =============================================
DROP FUNCTION IF EXISTS log_booking_event() CASCADE;
DROP FUNCTION IF EXISTS events_deny_update_delete() CASCADE;
DROP FUNCTION IF EXISTS report_booking_final_statuses(uuid, timestamptz, timestamptz) CASCADE;
DROP FUNCTION IF EXISTS report_booking_summary(uuid, timestamptz, timestamptz) CASCADE;
DROP FUNCTION IF EXISTS report_no_show_series(uuid, timestamptz, timestamptz, text) CASCADE;
DROP FUNCTION IF EXISTS report_cancellation(uuid, timestamptz, timestamptz) CASCADE;
DROP FUNCTION IF EXISTS report_deposit_summary(uuid, timestamptz, timestamptz) CASCADE;

-- =============================================
-- 5. Drop custom enums
-- =============================================
DROP TYPE IF EXISTS staff_role CASCADE;
DROP TYPE IF EXISTS booking_status CASCADE;
DROP TYPE IF EXISTS booking_source CASCADE;
DROP TYPE IF EXISTS deposit_status CASCADE;

-- =============================================
-- 6. Storage bucket
-- =============================================
-- Supabase blocks direct DELETE on storage tables via SQL.
-- If you need to clear the venue-covers bucket, do it from the dashboard:
--   Storage → venue-covers → select all → delete
-- The bucket itself can stay - supabase-full-schema.sql uses ON CONFLICT DO NOTHING.
