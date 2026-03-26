-- Reserve NI: Add currency column to venues
-- Supports GBP and EUR for businesses in Northern Ireland and border areas.

ALTER TABLE venues
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'GBP';

COMMENT ON COLUMN venues.currency IS 'ISO 4217 currency code: GBP or EUR';
