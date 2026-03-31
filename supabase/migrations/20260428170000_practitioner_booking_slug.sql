-- Model B: optional per-practitioner public booking URL segment (unique per venue)

ALTER TABLE practitioners
  ADD COLUMN IF NOT EXISTS slug text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_practitioners_venue_slug
  ON practitioners (venue_id, slug)
  WHERE slug IS NOT NULL;

COMMENT ON COLUMN practitioners.slug IS 'URL segment for /book/{venue-slug}/{slug}; lowercase alphanumeric and hyphens only.';
