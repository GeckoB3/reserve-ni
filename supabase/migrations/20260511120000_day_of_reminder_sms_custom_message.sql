-- Optional wording for day-of reminder SMS only; when null, falls back to day_of_reminder_custom_message (same line as email).
ALTER TABLE communication_settings
  ADD COLUMN IF NOT EXISTS day_of_reminder_sms_custom_message TEXT DEFAULT NULL;

COMMENT ON COLUMN communication_settings.day_of_reminder_sms_custom_message IS
  'Optional line prepended to day-of reminder SMS; if null, uses day_of_reminder_custom_message.';
