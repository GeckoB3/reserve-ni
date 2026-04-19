-- Truncate all application data in `public` (venues, bookings, staff, imports, etc.).
--
-- This is a manual maintenance script — NOT a migration. It does not run automatically.
-- Run from Supabase Dashboard → SQL → SQL Editor for each project (staging, then production).
--
-- What this does NOT clear (do separately if needed):
--   - auth.users (Dashboard → Authentication, or Admin API)
--   - Storage (bucket objects / files)
--   - Migration history (supabase_migrations.* — left untouched)
--
-- After adding migrations that CREATE new tables, add those tables to the TRUNCATE list below.
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
