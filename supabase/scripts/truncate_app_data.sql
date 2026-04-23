-- Truncate all application data in `public` (venues, bookings, staff, imports, etc.).
--
-- This is a manual maintenance script — NOT a migration. It does not run automatically.
-- Run from Supabase Dashboard → SQL → SQL Editor for each project (staging, then production).
--
-- Inventory: 56 tables (alphabetical below), covering every `CREATE TABLE` in
-- `supabase/migrations` for this app. When you add a migration that creates a new
-- `public` table, add its name to the TRUNCATE list.
--
-- What this does NOT clear (do separately if needed):
--   - auth.users (Dashboard → Authentication, or Admin API)
--   - Storage (bucket objects / files, e.g. imports CSV uploads)
--   - Migration history (supabase_migrations.* — left untouched)
--   - Other schemas (storage, realtime, vault, etc.)
--
-- Append-only `events` (row DELETE/UPDATE is blocked by trigger): PostgreSQL still
-- allows TRUNCATE TABLE on that table; row-level DELETE triggers are not fired for TRUNCATE.
--
-- Drift check (run in SQL Editor; both result sets should be empty when this script matches the DB):
--   WITH listed AS (
--     SELECT unnest(ARRAY[
--       'areas','appointment_services','availability_blocks','booking_restriction_exceptions',
--       'booking_restrictions','booking_table_assignments','booking_ticket_lines','bookings',
--       'calendar_blocks','calendar_service_assignments','class_instances','class_timetable',
--       'class_types','combination_auto_overrides','communication_logs','communication_settings',
--       'communications','custom_client_fields','event_sessions','event_ticket_types','events',
--       'experience_events','floor_plan_table_positions','floor_plans','guests',
--       'import_booking_references','import_booking_rows','import_column_mappings','import_files',
--       'import_records','import_sessions','import_validation_issues','party_size_durations',
--       'practitioner_calendar_blocks','practitioner_leave_periods','practitioner_services',
--       'practitioners','reconciliation_alerts','service_capacity_rules','service_items',
--       'service_schedule_exceptions','sms_log','sms_usage','staff','staff_calendar_assignments',
--       'table_blocks','table_combination_members','table_combinations','table_statuses',
--       'unified_calendars','venue_resources','venue_services','venue_tables','venues',
--       'waitlist_entries','webhook_events'
--     ]) AS tablename
--   )
--   SELECT 'extra_in_public_schema'::text AS drift_kind, t.tablename
--   FROM pg_tables t
--   WHERE t.schemaname = 'public'
--     AND NOT EXISTS (SELECT 1 FROM listed l WHERE l.tablename = t.tablename)
--   UNION ALL
--   SELECT 'missing_table_apply_migrations_first', l.tablename
--   FROM listed l
--   WHERE NOT EXISTS (
--     SELECT 1 FROM pg_tables t
--     WHERE t.schemaname = 'public' AND t.tablename = l.tablename
--   )
--   ORDER BY 1, 2;
--
-- Requires migrations to be applied so every table exists.

BEGIN;

TRUNCATE TABLE
  areas,
  appointment_services,
  availability_blocks,
  booking_restriction_exceptions,
  booking_restrictions,
  booking_table_assignments,
  booking_ticket_lines,
  bookings,
  calendar_blocks,
  calendar_service_assignments,
  class_instances,
  class_timetable,
  class_types,
  combination_auto_overrides,
  communication_logs,
  communication_settings,
  communications,
  custom_client_fields,
  event_sessions,
  event_ticket_types,
  events,
  experience_events,
  floor_plan_table_positions,
  floor_plans,
  guests,
  import_booking_references,
  import_booking_rows,
  import_column_mappings,
  import_files,
  import_records,
  import_sessions,
  import_validation_issues,
  party_size_durations,
  practitioner_calendar_blocks,
  practitioner_leave_periods,
  practitioner_services,
  practitioners,
  reconciliation_alerts,
  service_capacity_rules,
  service_items,
  service_schedule_exceptions,
  sms_log,
  sms_usage,
  staff,
  staff_calendar_assignments,
  table_blocks,
  table_combination_members,
  table_combinations,
  table_statuses,
  unified_calendars,
  venue_resources,
  venue_services,
  venue_tables,
  venues,
  waitlist_entries,
  webhook_events
RESTART IDENTITY CASCADE;

COMMIT;
