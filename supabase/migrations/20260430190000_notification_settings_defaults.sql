-- After unified_scheduling_engine: default guest notification toggles — confirmation SMS, second reminder,
-- and no-show notices are opt-in (aligns with application DEFAULT_NOTIFICATION_SETTINGS).

ALTER TABLE venues
  ALTER COLUMN notification_settings SET DEFAULT '{
    "confirmation_enabled": true,
    "confirmation_channels": ["email"],
    "confirmation_sms_custom_message": null,
    "reminder_1_enabled": true,
    "reminder_1_hours_before": 24,
    "reminder_1_channels": ["email", "sms"],
    "reminder_2_enabled": false,
    "reminder_2_hours_before": 2,
    "reminder_2_channels": ["sms"],
    "reschedule_notification_enabled": true,
    "cancellation_notification_enabled": true,
    "no_show_notification_enabled": false,
    "post_visit_enabled": true,
    "post_visit_timing": "4_hours_after",
    "daily_schedule_enabled": false,
    "staff_new_booking_alert": true,
    "staff_cancellation_alert": true
  }'::jsonb;
