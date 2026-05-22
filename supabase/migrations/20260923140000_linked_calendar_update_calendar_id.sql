-- =============================================================================
-- Linked Accounts: cross-venue booking update must support unified scheduling.
--
-- linked_apply_booking_update originally wrote only `practitioner_id`. Venues on
-- the appointments family key bookings on `calendar_id`; drag-reschedule from a
-- linked calendar sends the unified calendar column id and must update
-- `calendar_id`, not `practitioner_id` (FK to practitioners).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.linked_apply_booking_update(
  p_actor_user_id uuid,
  p_acting_venue_id uuid,
  p_link_id uuid,
  p_booking_id uuid,
  p_changes jsonb
)
RETURNS bookings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result bookings;
BEGIN
  PERFORM set_config('reserveni.linked_action_venue', p_acting_venue_id::text, true);
  PERFORM set_config('reserveni.linked_action_user', COALESCE(p_actor_user_id::text, ''), true);
  PERFORM set_config('reserveni.linked_action_link', COALESCE(p_link_id::text, ''), true);

  UPDATE bookings SET
    booking_date           = COALESCE((p_changes->>'booking_date')::date, booking_date),
    booking_time           = COALESCE((p_changes->>'booking_time')::time, booking_time),
    booking_end_time       = COALESCE((p_changes->>'booking_end_time')::time, booking_end_time),
    estimated_end_time     = CASE WHEN p_changes ? 'estimated_end_time'
                                  THEN (p_changes->>'estimated_end_time')::timestamptz
                                  ELSE estimated_end_time END,
    practitioner_id        = CASE WHEN p_changes ? 'practitioner_id'
                                  THEN NULLIF(p_changes->>'practitioner_id', '')::uuid
                                  ELSE practitioner_id END,
    calendar_id            = CASE WHEN p_changes ? 'calendar_id'
                                  THEN NULLIF(p_changes->>'calendar_id', '')::uuid
                                  ELSE calendar_id END,
    appointment_service_id = CASE WHEN p_changes ? 'appointment_service_id'
                                  THEN NULLIF(p_changes->>'appointment_service_id', '')::uuid
                                  ELSE appointment_service_id END,
    service_item_id        = CASE WHEN p_changes ? 'service_item_id'
                                  THEN NULLIF(p_changes->>'service_item_id', '')::uuid
                                  ELSE service_item_id END,
    status                 = COALESCE((p_changes->>'status')::booking_status, status),
    special_requests       = CASE WHEN p_changes ? 'special_requests'
                                  THEN p_changes->>'special_requests' ELSE special_requests END,
    dietary_notes          = CASE WHEN p_changes ? 'dietary_notes'
                                  THEN p_changes->>'dietary_notes' ELSE dietary_notes END,
    last_modified_by_linked_venue_id = p_acting_venue_id,
    updated_at             = now()
  WHERE id = p_booking_id
  RETURNING * INTO result;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.linked_apply_booking_update(uuid, uuid, uuid, uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.linked_apply_booking_update(uuid, uuid, uuid, uuid, jsonb) TO service_role;
