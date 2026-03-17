-- Add booking modification communication settings (email on by default, SMS off by default)
ALTER TABLE communication_settings
  ADD COLUMN IF NOT EXISTS modification_email_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS modification_sms_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS modification_custom_message TEXT DEFAULT NULL;
