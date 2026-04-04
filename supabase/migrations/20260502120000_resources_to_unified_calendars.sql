-- Migration: Move resources from venue_resources to unified_calendars
-- Resources become calendar columns on the main calendar, same as practitioners.

-- 1. Add resource-specific columns to unified_calendars
ALTER TABLE unified_calendars ADD COLUMN IF NOT EXISTS resource_type text;
ALTER TABLE unified_calendars ADD COLUMN IF NOT EXISTS availability_exceptions jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN unified_calendars.resource_type IS 'Resource category label (e.g. Tennis Court, Meeting Room). Only for calendar_type=resource.';
COMMENT ON COLUMN unified_calendars.availability_exceptions IS 'Per-date availability overrides. Keys are YYYY-MM-DD, values are {closed:true} or {periods:[{start,end}]}.';

-- 2. Copy venue_resources into unified_calendars using same UUIDs (preserves booking FKs)
INSERT INTO unified_calendars (
  id, venue_id, name, calendar_type, resource_type,
  working_hours, availability_exceptions,
  slot_interval_minutes, min_booking_minutes, max_booking_minutes,
  price_per_slot_pence, is_active, sort_order, created_at
)
SELECT
  id, venue_id, name, 'resource', resource_type,
  COALESCE(availability_hours, '{}'::jsonb),
  COALESCE(availability_exceptions, '{}'::jsonb),
  COALESCE(slot_interval_minutes, 30),
  COALESCE(min_booking_minutes, 60),
  COALESCE(max_booking_minutes, 120),
  price_per_slot_pence,
  is_active,
  sort_order,
  created_at
FROM venue_resources
ON CONFLICT (id) DO NOTHING;

-- 3. Backfill bookings.calendar_id from bookings.resource_id
UPDATE bookings
SET calendar_id = resource_id
WHERE resource_id IS NOT NULL
  AND calendar_id IS NULL;
