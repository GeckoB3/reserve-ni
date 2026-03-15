-- Communication settings: per-venue preferences for automated guest communications
CREATE TABLE IF NOT EXISTS communication_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,

  -- Booking Confirmation Email (always enabled)
  confirmation_email_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  confirmation_email_custom_message TEXT DEFAULT NULL,

  -- Deposit Request SMS
  deposit_sms_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  deposit_sms_custom_message TEXT DEFAULT NULL,

  -- Deposit Received Confirmation Email
  deposit_confirmation_email_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  deposit_confirmation_email_custom_message TEXT DEFAULT NULL,

  -- 56-Hour Reminder Email
  reminder_email_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  reminder_email_custom_message TEXT DEFAULT NULL,

  -- Day-of Reminder (SMS + Email)
  day_of_reminder_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  day_of_reminder_time TIME NOT NULL DEFAULT '09:00:00',
  day_of_reminder_sms_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  day_of_reminder_email_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  day_of_reminder_custom_message TEXT DEFAULT NULL,

  -- Post-Visit Thank You Email
  post_visit_email_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  post_visit_email_time TIME NOT NULL DEFAULT '09:00:00',
  post_visit_email_custom_message TEXT DEFAULT NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT unique_venue_comm_settings UNIQUE (venue_id)
);

ALTER TABLE communication_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Venue staff can view own comm settings"
  ON communication_settings FOR SELECT
  USING (venue_id IN (
    SELECT venue_id FROM staff WHERE email = (auth.jwt() ->> 'email')
  ));

CREATE POLICY "Venue staff can update own comm settings"
  ON communication_settings FOR UPDATE
  USING (venue_id IN (
    SELECT venue_id FROM staff WHERE email = (auth.jwt() ->> 'email')
  ));

CREATE POLICY "Venue staff can insert own comm settings"
  ON communication_settings FOR INSERT
  WITH CHECK (venue_id IN (
    SELECT venue_id FROM staff WHERE email = (auth.jwt() ->> 'email')
  ));

-- Communication logs: tracks every message for auditability and dedup
CREATE TABLE IF NOT EXISTS communication_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,

  message_type TEXT NOT NULL CHECK (message_type IN (
    'booking_confirmation_email',
    'deposit_request_sms',
    'deposit_confirmation_email',
    'reminder_56h_email',
    'day_of_reminder_sms',
    'day_of_reminder_email',
    'post_visit_email'
  )),

  channel TEXT NOT NULL CHECK (channel IN ('email', 'sms')),
  recipient TEXT NOT NULL,

  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'delivered', 'failed', 'bounced')),
  external_id TEXT,
  error_message TEXT,

  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT unique_message_per_booking UNIQUE (booking_id, message_type)
);

CREATE INDEX IF NOT EXISTS idx_comm_logs_booking_type ON communication_logs(booking_id, message_type);
CREATE INDEX IF NOT EXISTS idx_comm_logs_venue ON communication_logs(venue_id);

ALTER TABLE communication_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Venue staff can view own comm logs"
  ON communication_logs FOR SELECT
  USING (venue_id IN (
    SELECT venue_id FROM staff WHERE email = (auth.jwt() ->> 'email')
  ));

-- Ensure bookings has guest_email
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS guest_email TEXT;

-- Seed default communication_settings for existing venues
INSERT INTO communication_settings (venue_id)
SELECT id FROM venues
WHERE id NOT IN (SELECT venue_id FROM communication_settings)
ON CONFLICT DO NOTHING;
