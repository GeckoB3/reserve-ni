-- Permanent booking deletion (venue API DELETE /api/venue/bookings/[id]) must remove or
-- detach events rows. The original events_append_only trigger blocked:
--   - DELETE FROM events (explicit cleanup)
--   - UPDATE on events (required for FK ON DELETE SET NULL on events.booking_id)
-- Drop the trigger so cancelled bookings can be fully removed while keeping INSERT-only
-- behaviour for application code (staff JWT has no UPDATE/DELETE on events via RLS).

DROP TRIGGER IF EXISTS events_append_only ON public.events;
DROP FUNCTION IF EXISTS events_deny_update_delete();
