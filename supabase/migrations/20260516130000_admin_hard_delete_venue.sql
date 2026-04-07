-- Service-role-only RPC to fully remove a venue and its data.
-- Required because:
-- - bookings -> events FK uses ON DELETE SET NULL, which UPDATEs append-only `events` (blocked).
-- - `events` DELETE is also blocked unless the append-only trigger is temporarily disabled.
-- - Some tables reference staff without ON DELETE CASCADE.
-- - Delete events by venue_id OR by booking_id for this venue's bookings (handles mismatched venue_id on event rows).
-- - Remove booking_table_assignments before bookings: CASCADE delete fires trg_log_table_assignment
--   (INSERT into events with OLD.booking_id) but FK can fail if booking row is already gone.

CREATE OR REPLACE FUNCTION admin_hard_delete_venue(p_venue_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  staff_ids uuid[];
BEGIN
  IF p_venue_id IS NULL THEN
    RAISE EXCEPTION 'venue id required';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM venues WHERE id = p_venue_id) THEN
    RAISE EXCEPTION 'venue not found: %', p_venue_id;
  END IF;

  SELECT coalesce(array_agg(id), ARRAY[]::uuid[]) INTO staff_ids FROM staff WHERE venue_id = p_venue_id;

  IF cardinality(staff_ids) > 0 THEN
    UPDATE practitioner_calendar_blocks SET created_by = NULL WHERE created_by = ANY (staff_ids);
    UPDATE calendar_blocks SET created_by = NULL WHERE created_by = ANY (staff_ids);
    UPDATE table_blocks SET created_by = NULL WHERE created_by = ANY (staff_ids);
    UPDATE booking_table_assignments SET assigned_by = NULL WHERE assigned_by = ANY (staff_ids);
    UPDATE table_statuses SET updated_by = NULL WHERE updated_by = ANY (staff_ids);
    UPDATE unified_calendars SET staff_id = NULL WHERE staff_id = ANY (staff_ids);
  END IF;

  UPDATE table_statuses ts
  SET booking_id = NULL
  FROM venue_tables vt
  WHERE ts.table_id = vt.id AND vt.venue_id = p_venue_id;

  ALTER TABLE events DISABLE TRIGGER events_append_only;
  DELETE FROM events e
  WHERE e.venue_id = p_venue_id
     OR e.booking_id IN (SELECT b.id FROM bookings b WHERE b.venue_id = p_venue_id);
  ALTER TABLE events ENABLE TRIGGER events_append_only;

  ALTER TABLE booking_table_assignments DISABLE TRIGGER trg_log_table_assignment;
  DELETE FROM booking_table_assignments
  WHERE booking_id IN (SELECT b.id FROM bookings b WHERE b.venue_id = p_venue_id);
  ALTER TABLE booking_table_assignments ENABLE TRIGGER trg_log_table_assignment;

  DELETE FROM bookings WHERE venue_id = p_venue_id;

  DELETE FROM venues WHERE id = p_venue_id;
END;
$$;

REVOKE ALL ON FUNCTION admin_hard_delete_venue(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_hard_delete_venue(uuid) TO service_role;

COMMENT ON FUNCTION admin_hard_delete_venue(uuid) IS
  'Hard-delete a venue and dependent rows. Callable only by service_role. Used for admin cleanup / test reset.';
