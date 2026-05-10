-- Contacts directory: filter guests whose *latest* non-cancelled booking matches staff or service columns.
CREATE OR REPLACE FUNCTION public.contacts_filter_guest_ids_latest_booking_match(
  p_venue_id uuid,
  p_staff_column_id uuid DEFAULT NULL,
  p_appointment_service_id uuid DEFAULT NULL,
  p_service_item_id uuid DEFAULT NULL
)
RETURNS TABLE (guest_id uuid)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH latest AS (
    SELECT DISTINCT ON (b.guest_id)
      b.guest_id,
      b.practitioner_id,
      b.calendar_id,
      b.appointment_service_id,
      b.service_item_id
    FROM public.bookings b
    WHERE b.venue_id = p_venue_id
      AND b.guest_id IS NOT NULL
      AND b.status NOT IN ('Cancelled', 'No-Show')
    ORDER BY b.guest_id, b.booking_date DESC, b.booking_time DESC
  )
  SELECT l.guest_id
  FROM latest l
  WHERE
    (p_staff_column_id IS NULL
      OR l.practitioner_id = p_staff_column_id
      OR l.calendar_id = p_staff_column_id)
    AND (p_appointment_service_id IS NULL OR l.appointment_service_id = p_appointment_service_id)
    AND (p_service_item_id IS NULL OR l.service_item_id = p_service_item_id)
    AND (
      p_staff_column_id IS NOT NULL
      OR p_appointment_service_id IS NOT NULL
      OR p_service_item_id IS NOT NULL
    );
$$;

GRANT EXECUTE ON FUNCTION public.contacts_filter_guest_ids_latest_booking_match(uuid, uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.contacts_filter_guest_ids_latest_booking_match(uuid, uuid, uuid, uuid) TO service_role;
