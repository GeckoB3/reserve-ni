-- Staff can mark a client as arrived/waiting (Model B) without changing booking status.
-- Cleared automatically when treatment starts (status → Seated).
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS client_arrived_at timestamptz;

COMMENT ON COLUMN bookings.client_arrived_at IS 'Optional: staff marked client as arrived and waiting (appointments). Cleared when status becomes Seated.';
