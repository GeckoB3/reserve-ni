-- Reserve NI: cron deduplication markers for one-time sends.
ALTER TABLE bookings
ADD COLUMN IF NOT EXISTS thankyou_sent_at timestamptz,
ADD COLUMN IF NOT EXISTS reminder_48h_sent_at timestamptz;
