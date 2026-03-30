-- Pre-launch hardening: avoid wiping bookings when a venue is deleted; keep reconciliation rows if a booking is removed.

ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_venue_id_fkey;
ALTER TABLE bookings
  ADD CONSTRAINT bookings_venue_id_fkey
  FOREIGN KEY (venue_id) REFERENCES venues (id) ON DELETE RESTRICT;

ALTER TABLE reconciliation_alerts DROP CONSTRAINT IF EXISTS reconciliation_alerts_booking_id_fkey;
ALTER TABLE reconciliation_alerts ALTER COLUMN booking_id DROP NOT NULL;
ALTER TABLE reconciliation_alerts
  ADD CONSTRAINT reconciliation_alerts_booking_id_fkey
  FOREIGN KEY (booking_id) REFERENCES bookings (id) ON DELETE SET NULL;

-- Cron paths (phone + pending deposit window) and communication history by venue + time
CREATE INDEX IF NOT EXISTS idx_bookings_phone_pending_created
  ON bookings (source, status, deposit_status, created_at);

CREATE INDEX IF NOT EXISTS idx_comm_logs_venue_created
  ON communication_logs (venue_id, created_at DESC);
