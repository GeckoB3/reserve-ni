-- Import execution: insert a booking and its undo-audit record atomically.
--
-- Previously the import inserted the booking, then the import_records audit
-- row, and manually deleted the booking when the audit insert failed — a
-- compensation that could itself fail, leaving bookings invisible to undo.
-- One transaction removes that failure class and halves the round trips.
--
-- The booking payload's keys are produced exclusively by server code
-- (run-execute.ts); jsonb_populate_record coerces values to the bookings row
-- type, and only the provided columns are inserted so column defaults
-- (id, created_at, …) still apply.

CREATE OR REPLACE FUNCTION public.import_insert_booking_with_audit(
  p_session_id uuid,
  p_venue_id uuid,
  p_booking jsonb
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cols text;
  v_id uuid;
BEGIN
  IF p_booking IS NULL OR jsonb_typeof(p_booking) <> 'object' THEN
    RAISE EXCEPTION 'import_insert_booking_with_audit: booking payload must be a JSON object';
  END IF;
  IF (p_booking->>'venue_id')::uuid IS DISTINCT FROM p_venue_id THEN
    RAISE EXCEPTION 'import_insert_booking_with_audit: booking venue mismatch';
  END IF;

  SELECT string_agg(quote_ident(key), ', ' ORDER BY key)
    INTO v_cols
    FROM jsonb_object_keys(p_booking) AS t(key);

  IF v_cols IS NULL THEN
    RAISE EXCEPTION 'import_insert_booking_with_audit: empty booking payload';
  END IF;

  EXECUTE format(
    'INSERT INTO public.bookings (%s) SELECT %s FROM jsonb_populate_record(NULL::public.bookings, $1) RETURNING id',
    v_cols, v_cols
  )
  INTO v_id
  USING p_booking;

  INSERT INTO public.import_records (session_id, venue_id, record_type, record_id, action, previous_data)
  VALUES (p_session_id, p_venue_id, 'booking', v_id, 'created', NULL);

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.import_insert_booking_with_audit(uuid, uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.import_insert_booking_with_audit(uuid, uuid, jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.import_insert_booking_with_audit(uuid, uuid, jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.import_insert_booking_with_audit(uuid, uuid, jsonb) TO service_role;
