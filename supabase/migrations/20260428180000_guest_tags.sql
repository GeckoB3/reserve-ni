-- Guest CRM: free-text tags per guest (venue-scoped)

ALTER TABLE guests
  ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_guests_tags ON guests USING gin (tags);

COMMENT ON COLUMN guests.tags IS 'Venue-defined labels (VIP, allergy, etc.); max length enforced in application.';
