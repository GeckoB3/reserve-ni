-- Public-facing business website URL (optional), editable in dashboard settings.

ALTER TABLE venues
  ADD COLUMN IF NOT EXISTS website_url text;

COMMENT ON COLUMN venues.website_url IS 'Business website URL (https), shown on the public booking page when set.';
