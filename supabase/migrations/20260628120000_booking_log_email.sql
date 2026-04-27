-- Daily booking log email settings and attribution.

ALTER TABLE venues
  ADD COLUMN IF NOT EXISTS daily_booking_log_email_config jsonb NOT NULL DEFAULT
    '{"enabled":false,"recipient_email":null,"schedule":[]}'::jsonb;

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS created_by_staff_id uuid REFERENCES staff (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cancelled_by_staff_id uuid REFERENCES staff (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cancellation_actor_type text;

ALTER TABLE bookings
  DROP CONSTRAINT IF EXISTS bookings_cancellation_actor_type_check;

ALTER TABLE bookings
  ADD CONSTRAINT bookings_cancellation_actor_type_check
  CHECK (cancellation_actor_type IS NULL OR cancellation_actor_type IN ('customer', 'staff', 'system', 'import'));

CREATE INDEX IF NOT EXISTS idx_bookings_created_by_staff_id ON bookings (created_by_staff_id);
CREATE INDEX IF NOT EXISTS idx_bookings_cancelled_by_staff_id ON bookings (cancelled_by_staff_id);

CREATE TABLE IF NOT EXISTS booking_log_email_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES venues (id) ON DELETE CASCADE,
  schedule_key text NOT NULL,
  recipient_email text NOT NULL,
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  error_message text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (venue_id, schedule_key)
);

CREATE INDEX IF NOT EXISTS idx_booking_log_email_deliveries_venue_created
  ON booking_log_email_deliveries (venue_id, created_at DESC);

-- RLS: rows are only read/written by service-role server code (e.g. booking-log email cron).
-- No policies for authenticated/anon — they cannot access this table via PostgREST; service role bypasses RLS.
ALTER TABLE booking_log_email_deliveries ENABLE ROW LEVEL SECURITY;
