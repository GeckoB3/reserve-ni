-- =============================================================================
-- Combined page as a single-venue experience (plan §22)
-- -----------------------------------------------------------------------------
-- The combined booking page must look like ONE venue. This adds a collective-
-- level booking-page config (mirroring venues.booking_page_config) for
-- single-venue-grade customisation, a per-offering image, and makes the feature
-- COMBINED-ONLY (plan D-V1): every collective is a single combined page; the old
-- "directory" mode is retired.
-- =============================================================================

ALTER TABLE venue_collectives
  ADD COLUMN IF NOT EXISTS booking_page_config jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE collective_service_items
  ADD COLUMN IF NOT EXISTS image_url text;

COMMENT ON COLUMN venue_collectives.booking_page_config IS
  'Single-venue-grade public-page config for the combined page (mirrors venues.booking_page_config): brand colours, font, cover, about, tab toggles, etc. Host-curated (plan §22 / D-V2).';

-- Combined-only (D-V1): every existing collective becomes a combined page.
UPDATE venue_collectives SET page_mode = 'unified_catalog' WHERE page_mode <> 'unified_catalog';

-- The default for new rows is now combined too.
ALTER TABLE venue_collectives ALTER COLUMN page_mode SET DEFAULT 'unified_catalog';

-- Seed the page config from any existing branding so current collectives keep
-- their look once the page renders via the standard layout.
UPDATE venue_collectives
SET booking_page_config = jsonb_strip_nulls(
  jsonb_build_object(
    'brand_primary', branding ->> 'primary_colour',
    'about', branding ->> 'description'
  )
)
WHERE booking_page_config = '{}'::jsonb
  AND branding IS NOT NULL
  AND branding <> '{}'::jsonb;
