-- Reserve NI: Fill schema gaps identified in PRD audit.

-- 1. Venue fields
ALTER TABLE venues ADD COLUMN IF NOT EXISTS cuisine_type text;
ALTER TABLE venues ADD COLUMN IF NOT EXISTS price_band text;
ALTER TABLE venues ADD COLUMN IF NOT EXISTS no_show_grace_minutes int NOT NULL DEFAULT 15;
ALTER TABLE venues ADD COLUMN IF NOT EXISTS kitchen_email text;
ALTER TABLE venues ADD COLUMN IF NOT EXISTS communication_templates jsonb;

-- 2. Guest fields
ALTER TABLE guests ADD COLUMN IF NOT EXISTS no_show_count int NOT NULL DEFAULT 0;
ALTER TABLE guests ADD COLUMN IF NOT EXISTS last_visit_date date;
ALTER TABLE guests ADD COLUMN IF NOT EXISTS dietary_preferences text;

-- 3. Booking field - snapshot of cancellation policy at booking time
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS cancellation_policy_snapshot jsonb;

-- 4. Communications log table (every message sent)
CREATE TABLE IF NOT EXISTS communications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES venues (id) ON DELETE CASCADE,
  booking_id uuid REFERENCES bookings (id) ON DELETE SET NULL,
  guest_id uuid REFERENCES guests (id) ON DELETE SET NULL,
  message_type text NOT NULL,
  channel text NOT NULL,
  recipient_email text,
  recipient_phone text,
  status text NOT NULL DEFAULT 'sent',
  template_version text,
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_communications_booking ON communications (booking_id);
CREATE INDEX IF NOT EXISTS idx_communications_venue ON communications (venue_id);
CREATE INDEX IF NOT EXISTS idx_communications_guest ON communications (guest_id);

-- RLS on communications: staff can read comms for their venue
ALTER TABLE communications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_select_communications"
  ON communications FOR SELECT
  USING (
    venue_id IN (
      SELECT venue_id FROM staff
      WHERE email = (auth.jwt() ->> 'email')
    )
  );

-- 5. Update booking_source enum to distinguish widget vs booking_page
ALTER TYPE booking_source ADD VALUE IF NOT EXISTS 'widget';
ALTER TYPE booking_source ADD VALUE IF NOT EXISTS 'booking_page';
