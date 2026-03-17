-- Add booking cancellation communication settings (email on by default, SMS off by default)
ALTER TABLE communication_settings
  ADD COLUMN IF NOT EXISTS cancellation_email_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS cancellation_sms_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cancellation_custom_message TEXT DEFAULT NULL;
