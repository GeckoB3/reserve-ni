/**
 * `communication_logs.message_type` values for scheduled guest messages that must be
 * cleared when a booking's start time changes so cron can send reminders again.
 */
export const COMMUNICATION_LOG_TYPES_RESET_ON_BOOKING_START_CHANGE = [
  // Policy-based (current): appointments + table lanes via sendPolicyMessage / unified cron
  'confirm_or_cancel_prompt_email',
  'confirm_or_cancel_prompt_sms',
  'pre_visit_reminder_email',
  'pre_visit_reminder_sms',
  'post_visit_thankyou_email',
  // Legacy table cron / older migrations (harmless if absent)
  'reminder_56h_email',
  'day_of_reminder_sms',
  'day_of_reminder_email',
  'post_visit_email',
  'reminder_1_email',
  'reminder_1_sms',
  'reminder_2_email',
  'reminder_2_sms',
  'unified_post_visit_email',
] as const;
