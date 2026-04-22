-- Pre-visit reminder: default to email only for new venues (table + appointments lanes).
-- Appointments and restaurant paid signups use the column default; code fallback is policies.ts.
ALTER TABLE venues
  ALTER COLUMN communication_policies SET DEFAULT '{
    "table": {
      "booking_confirmation": {"enabled": true, "channels": ["email"], "emailCustomMessage": null, "smsCustomMessage": null, "hoursBefore": null, "hoursAfter": null},
      "deposit_payment_request": {"enabled": true, "channels": ["email", "sms"], "emailCustomMessage": null, "smsCustomMessage": null, "hoursBefore": null, "hoursAfter": null},
      "deposit_confirmation": {"enabled": true, "channels": ["email"], "emailCustomMessage": null, "smsCustomMessage": null, "hoursBefore": null, "hoursAfter": null},
      "confirm_or_cancel_prompt": {"enabled": true, "channels": ["email", "sms"], "emailCustomMessage": null, "smsCustomMessage": null, "hoursBefore": 24, "hoursAfter": null},
      "deposit_payment_reminder": {"enabled": true, "channels": ["sms"], "emailCustomMessage": null, "smsCustomMessage": null, "hoursBefore": 2, "hoursAfter": null},
      "pre_visit_reminder": {"enabled": true, "channels": ["email"], "emailCustomMessage": null, "smsCustomMessage": null, "hoursBefore": 2, "hoursAfter": null},
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
      "pre_visit_reminder": {"enabled": true, "channels": ["email"], "emailCustomMessage": null, "smsCustomMessage": null, "hoursBefore": 2, "hoursAfter": null},
      "booking_modification": {"enabled": true, "channels": ["email"], "emailCustomMessage": null, "smsCustomMessage": null, "hoursBefore": null, "hoursAfter": null},
      "cancellation_confirmation": {"enabled": true, "channels": ["email"], "emailCustomMessage": null, "smsCustomMessage": null, "hoursBefore": null, "hoursAfter": null},
      "auto_cancel_notification": {"enabled": true, "channels": ["email", "sms"], "emailCustomMessage": null, "smsCustomMessage": null, "hoursBefore": null, "hoursAfter": null},
      "custom_message": {"enabled": true, "channels": ["email", "sms"], "emailCustomMessage": null, "smsCustomMessage": null, "hoursBefore": null, "hoursAfter": null},
      "no_show_notification": {"enabled": false, "channels": ["email"], "emailCustomMessage": null, "smsCustomMessage": null, "hoursBefore": null, "hoursAfter": null},
      "post_visit_thankyou": {"enabled": true, "channels": ["email"], "emailCustomMessage": null, "smsCustomMessage": null, "hoursBefore": null, "hoursAfter": 4}
    }
  }'::jsonb;
