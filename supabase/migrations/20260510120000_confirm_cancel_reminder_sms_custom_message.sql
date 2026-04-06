-- Optional SMS line for Confirm or Cancel Reminder (56h / unified & CDE first + second reminder SMS).
-- Day-of reminder email/SMS uses day_of_reminder_custom_message only.
ALTER TABLE public.communication_settings
ADD COLUMN IF NOT EXISTS confirm_cancel_reminder_sms_custom_message TEXT;

COMMENT ON COLUMN public.communication_settings.confirm_cancel_reminder_sms_custom_message IS
  'Optional prefix for Confirm or Cancel Reminder SMS (not day-of).';

-- Preserve behaviour: copy existing shared wording into the confirm/cancel-specific column.
UPDATE public.communication_settings
SET confirm_cancel_reminder_sms_custom_message = day_of_reminder_custom_message
WHERE confirm_cancel_reminder_sms_custom_message IS NULL
  AND day_of_reminder_custom_message IS NOT NULL;
