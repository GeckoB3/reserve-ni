-- Reserve NI: 24h reminder tracking and confirm-or-cancel token

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS reminder_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS confirm_token_hash text,
  ADD COLUMN IF NOT EXISTS confirm_token_used_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_bookings_reminder_sent ON bookings (reminder_sent_at) WHERE reminder_sent_at IS NULL;
