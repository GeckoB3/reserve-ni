ALTER TABLE venues
  ADD COLUMN IF NOT EXISTS communication_policies jsonb NOT NULL DEFAULT '{
    "table": {
      "booking_confirmation": {"enabled": true, "channels": ["email"], "emailCustomMessage": null, "smsCustomMessage": null, "hoursBefore": null, "hoursAfter": null},
      "deposit_payment_request": {"enabled": true, "channels": ["email", "sms"], "emailCustomMessage": null, "smsCustomMessage": null, "hoursBefore": null, "hoursAfter": null},
      "deposit_confirmation": {"enabled": true, "channels": ["email"], "emailCustomMessage": null, "smsCustomMessage": null, "hoursBefore": null, "hoursAfter": null},
      "confirm_or_cancel_prompt": {"enabled": true, "channels": ["email", "sms"], "emailCustomMessage": null, "smsCustomMessage": null, "hoursBefore": 24, "hoursAfter": null},
      "deposit_payment_reminder": {"enabled": true, "channels": ["sms"], "emailCustomMessage": null, "smsCustomMessage": null, "hoursBefore": 2, "hoursAfter": null},
      "pre_visit_reminder": {"enabled": true, "channels": ["email", "sms"], "emailCustomMessage": null, "smsCustomMessage": null, "hoursBefore": 2, "hoursAfter": null},
      "booking_modification": {"enabled": true, "channels": ["email"], "emailCustomMessage": null, "smsCustomMessage": null, "hoursBefore": null, "hoursAfter": null},
      "cancellation_confirmation": {"enabled": true, "channels": ["email"], "emailCustomMessage": null, "smsCustomMessage": null, "hoursBefore": null, "hoursAfter": null},
      "auto_cancel_notification": {"enabled": true, "channels": ["email", "sms"], "emailCustomMessage": null, "smsCustomMessage": null, "hoursBefore": null, "hoursAfter": null},
      "custom_message": {"enabled": true, "channels": ["email", "sms"], "emailCustomMessage": null, "smsCustomMessage": null, "hoursBefore": null, "hoursAfter": null},
      "no_show_notification": {"enabled": false, "channels": ["email"], "emailCustomMessage": null, "smsCustomMessage": null, "hoursBefore": null, "hoursAfter": null},
      "post_visit_thankyou": {"enabled": true, "channels": ["email"], "emailCustomMessage": null, "smsCustomMessage": null, "hoursBefore": null, "hoursAfter": 4}
    },
    "appointments_other": {
      "booking_confirmation": {"enabled": true, "channels": ["email"], "emailCustomMessage": null, "smsCustomMessage": null, "hoursBefore": null, "hoursAfter": null},
      "deposit_payment_request": {"enabled": true, "channels": ["email", "sms"], "emailCustomMessage": null, "smsCustomMessage": null, "hoursBefore": null, "hoursAfter": null},
      "deposit_confirmation": {"enabled": true, "channels": ["email"], "emailCustomMessage": null, "smsCustomMessage": null, "hoursBefore": null, "hoursAfter": null},
      "confirm_or_cancel_prompt": {"enabled": true, "channels": ["email", "sms"], "emailCustomMessage": null, "smsCustomMessage": null, "hoursBefore": 24, "hoursAfter": null},
      "deposit_payment_reminder": {"enabled": true, "channels": ["sms"], "emailCustomMessage": null, "smsCustomMessage": null, "hoursBefore": 2, "hoursAfter": null},
      "pre_visit_reminder": {"enabled": true, "channels": ["email", "sms"], "emailCustomMessage": null, "smsCustomMessage": null, "hoursBefore": 2, "hoursAfter": null},
      "booking_modification": {"enabled": true, "channels": ["email"], "emailCustomMessage": null, "smsCustomMessage": null, "hoursBefore": null, "hoursAfter": null},
      "cancellation_confirmation": {"enabled": true, "channels": ["email"], "emailCustomMessage": null, "smsCustomMessage": null, "hoursBefore": null, "hoursAfter": null},
      "auto_cancel_notification": {"enabled": true, "channels": ["email", "sms"], "emailCustomMessage": null, "smsCustomMessage": null, "hoursBefore": null, "hoursAfter": null},
      "custom_message": {"enabled": true, "channels": ["email", "sms"], "emailCustomMessage": null, "smsCustomMessage": null, "hoursBefore": null, "hoursAfter": null},
      "no_show_notification": {"enabled": false, "channels": ["email"], "emailCustomMessage": null, "smsCustomMessage": null, "hoursBefore": null, "hoursAfter": null},
      "post_visit_thankyou": {"enabled": true, "channels": ["email"], "emailCustomMessage": null, "smsCustomMessage": null, "hoursBefore": null, "hoursAfter": 4}
    }
  }'::jsonb;

ALTER TABLE communication_logs
  ADD COLUMN IF NOT EXISTS communication_lane text NOT NULL DEFAULT 'table';

ALTER TABLE communication_logs
  DROP CONSTRAINT IF EXISTS communication_logs_message_type_check;

ALTER TABLE communication_logs
  ADD CONSTRAINT communication_logs_message_type_check CHECK (message_type IN (
    'booking_confirmation_email',
    'booking_confirmation_sms',
    'deposit_request_sms',
    'deposit_request_email',
    'deposit_confirmation_email',
    'reminder_56h_email',
    'day_of_reminder_sms',
    'day_of_reminder_email',
    'post_visit_email',
    'reminder_1_email',
    'reminder_1_sms',
    'reminder_2_email',
    'reminder_2_sms',
    'unified_post_visit_email',
    'booking_modification_email',
    'booking_modification_sms',
    'cancellation_email',
    'cancellation_sms',
    'confirm_or_cancel_prompt_email',
    'confirm_or_cancel_prompt_sms',
    'deposit_payment_reminder_email',
    'deposit_payment_reminder_sms',
    'pre_visit_reminder_email',
    'pre_visit_reminder_sms',
    'cancellation_confirmation_email',
    'cancellation_confirmation_sms',
    'auto_cancel_notification_email',
    'auto_cancel_notification_sms',
    'custom_message_email',
    'custom_message_sms',
    'no_show_notification_email',
    'post_visit_thankyou_email'
  ));

ALTER TABLE communication_logs
  DROP CONSTRAINT IF EXISTS unique_message_per_booking;

ALTER TABLE communication_logs
  ADD CONSTRAINT unique_message_per_booking_lane
  UNIQUE (booking_id, message_type, communication_lane);
