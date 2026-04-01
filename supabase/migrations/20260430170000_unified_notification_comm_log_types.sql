-- Message types for unified scheduling reminder / post-visit cron (§4.2)
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
    'cancellation_sms',
    'reminder_1_email',
    'reminder_1_sms',
    'reminder_2_sms',
    'unified_post_visit_email'
  ));
