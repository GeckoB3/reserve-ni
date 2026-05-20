-- Optional hex accent for public embed iframe (?accent=RRGGBB). Admin-set in Settings → Booking page.
ALTER TABLE venues
  ADD COLUMN IF NOT EXISTS embed_accent_colour text;

COMMENT ON COLUMN venues.embed_accent_colour IS
  '6-digit hex (no #) appended as ?accent= on /embed/{slug} iframe URLs for guest booking widget chrome.';
