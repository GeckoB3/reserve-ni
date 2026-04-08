-- Resource definitions moved to unified_calendars (calendar_type = 'resource'); new resources
-- are created there only. bookings.resource_id still referenced legacy venue_resources, causing
-- FK 23503 when staff or guests book a resource created after the USE migration.
-- Point the FK at unified_calendars (same UUIDs as migrated venue_resources rows).

ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_resource_id_fkey;

-- Avoid ADD CONSTRAINT failure if any orphan resource_id does not exist in unified_calendars.
UPDATE bookings
SET resource_id = NULL
WHERE resource_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM unified_calendars uc WHERE uc.id = bookings.resource_id);

ALTER TABLE bookings
  ADD CONSTRAINT bookings_resource_id_fkey
  FOREIGN KEY (resource_id)
  REFERENCES unified_calendars(id)
  ON DELETE SET NULL;
