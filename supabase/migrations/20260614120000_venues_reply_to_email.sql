-- Guest email Reply-To: business inbox (Profile email). Kept in sync with venues.email from the app.
ALTER TABLE venues
  ADD COLUMN IF NOT EXISTS reply_to_email text;

COMMENT ON COLUMN venues.reply_to_email IS
  'Address used for the Reply-To header on guest-facing emails; typically matches Profile email.';

UPDATE venues
SET reply_to_email = NULLIF(trim(email), '')
WHERE reply_to_email IS NULL
  AND email IS NOT NULL
  AND trim(email) <> '';
