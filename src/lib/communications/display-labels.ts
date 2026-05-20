/** Human-readable label for a `communication_logs.message_type` value. */
export function formatCommunicationLogLabel(messageType: string): string {
  const normalized = messageType.replace(/_(email|sms)$/i, '');
  const titles: Record<string, string> = {
    booking_confirmation: 'Booking confirmation',
    deposit_request: 'Deposit payment request',
    deposit_payment_request: 'Deposit payment request',
    deposit_confirmation: 'Deposit confirmation',
    confirm_or_cancel_prompt: 'Confirm or cancel',
    deposit_payment_reminder: 'Deposit payment reminder',
    pre_visit_reminder: 'Pre-visit reminder',
    booking_modification: 'Booking modification',
    cancellation_confirmation: 'Cancellation confirmation',
    auto_cancel_notification: 'Auto-cancel (unpaid deposit)',
    custom_message: 'Custom message',
    no_show_notification: 'No-show notification',
    post_visit_thankyou: 'Post-visit thank you',
    reminder_56h_email: 'Confirm or cancel reminder',
    day_of_reminder: 'Pre-visit reminder',
    day_of_reminder_email: 'Pre-visit reminder',
    day_of_reminder_sms: 'Pre-visit reminder',
    reminder_1: 'Reminder',
    reminder_2: 'Reminder',
    post_visit_email: 'Post-visit thank you',
    marketing_bulk: 'Marketing message',
  };
  if (titles[normalized]) return titles[normalized];
  if (titles[messageType]) return titles[messageType];
  return messageType.replace(/_/g, ' ');
}
