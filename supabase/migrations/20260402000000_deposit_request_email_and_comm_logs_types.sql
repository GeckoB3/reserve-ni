-- Deposit request email (staff / pay-by-link flows) + widen communication_logs message_type check
ALTER TABLE communication_settings
  ADD COLUMN IF NOT EXISTS deposit_request_email_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS deposit_request_email_custom_message TEXT;

-- Replace CHECK constraint to include all message types used by the app
ALTER TABLE communication_logs DROP CONSTRAINT IF EXISTS communication_logs_message_type_check;

ALTER TABLE communication_logs
  ADD CONSTRAINT communication_logs_message_type_check CHECK (message_type IN (
    'booking_confirmation_email',
    'deposit_request_sms',
    'deposit_request_email',
    'deposit_confirmation_email',
    'reminder_56h_email',
    'day_of_reminder_sms',
    'day_of_reminder_email',
    'post_visit_email',
    'booking_modification_email',
    'booking_modification_sms',
    'cancellation_email',
    'cancellation_sms'
  ));
