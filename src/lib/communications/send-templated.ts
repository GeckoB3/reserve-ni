/**
 * High-level helpers for sending templated communications with settings checks,
 * dedup via communication_logs, and new HTML templates.
 */
import type { BookingEmailData, VenueEmailData, CommMessageType } from '@/lib/emails/types';
import { renderBookingConfirmation } from '@/lib/emails/templates/booking-confirmation';
import { renderDepositRequestSms } from '@/lib/emails/templates/deposit-request-sms';
import { renderDepositConfirmation } from '@/lib/emails/templates/deposit-confirmation';
import { sendEmail } from '@/lib/emails/send-email';
import { sendSms } from '@/lib/emails/send-sms';
import { getCommSettings, logToCommLogs, updateCommLogStatus } from './service';

interface SendResult {
  sent: boolean;
  reason?: string;
}

async function trySendWithDedup(opts: {
  venueId: string;
  bookingId: string;
  messageType: CommMessageType;
  channel: 'email' | 'sms';
  recipient: string;
  sendFn: () => Promise<string | null>;
}): Promise<SendResult> {
  const canSend = await logToCommLogs({
    venue_id: opts.venueId,
    booking_id: opts.bookingId,
    message_type: opts.messageType,
    channel: opts.channel,
    recipient: opts.recipient,
    status: 'pending',
  });

  if (!canSend) return { sent: false, reason: 'duplicate' };

  try {
    const externalId = await opts.sendFn();
    await updateCommLogStatus({
      venue_id: opts.venueId,
      booking_id: opts.bookingId,
      message_type: opts.messageType,
      status: 'sent',
      external_id: externalId,
    });
    return { sent: true };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error(`[send-templated] ${opts.messageType} ${opts.channel} failed:`, err);
    await updateCommLogStatus({
      venue_id: opts.venueId,
      booking_id: opts.bookingId,
      message_type: opts.messageType,
      status: 'failed',
      error_message: errMsg,
    });
    return { sent: false, reason: 'send_error' };
  }
}

export async function sendBookingConfirmationEmail(
  booking: BookingEmailData,
  venue: VenueEmailData,
  venueId: string,
): Promise<SendResult> {
  if (!booking.guest_email) return { sent: false, reason: 'no_email' };

  try {
    const settings = await getCommSettings(venueId);
    if (!settings.confirmation_email_enabled) return { sent: false, reason: 'disabled' };

    const rendered = renderBookingConfirmation(booking, venue, settings.confirmation_email_custom_message);

    return trySendWithDedup({
      venueId,
      bookingId: booking.id,
      messageType: 'booking_confirmation_email',
      channel: 'email',
      recipient: booking.guest_email,
      sendFn: () => sendEmail({ to: booking.guest_email!, ...rendered }),
    });
  } catch (err) {
    console.error('[send-templated] booking confirmation email error:', err);
    return { sent: false, reason: 'error' };
  }
}

export async function sendDepositRequestSms(
  booking: BookingEmailData,
  venue: VenueEmailData,
  venueId: string,
  paymentLink: string,
  guestPhone: string,
): Promise<SendResult> {
  if (!guestPhone) return { sent: false, reason: 'no_phone' };

  try {
    const settings = await getCommSettings(venueId);
    if (!settings.deposit_sms_enabled) return { sent: false, reason: 'disabled' };

    const rendered = renderDepositRequestSms(booking, venue, paymentLink, settings.deposit_sms_custom_message);

    return trySendWithDedup({
      venueId,
      bookingId: booking.id,
      messageType: 'deposit_request_sms',
      channel: 'sms',
      recipient: guestPhone,
      sendFn: () => sendSms(guestPhone, rendered.body),
    });
  } catch (err) {
    console.error('[send-templated] deposit request SMS error:', err);
    return { sent: false, reason: 'error' };
  }
}

export async function sendDepositConfirmationEmail(
  booking: BookingEmailData,
  venue: VenueEmailData,
  venueId: string,
): Promise<SendResult> {
  if (!booking.guest_email) return { sent: false, reason: 'no_email' };

  try {
    const settings = await getCommSettings(venueId);
    if (!settings.deposit_confirmation_email_enabled) return { sent: false, reason: 'disabled' };

    const rendered = renderDepositConfirmation(booking, venue, settings.deposit_confirmation_email_custom_message);

    return trySendWithDedup({
      venueId,
      bookingId: booking.id,
      messageType: 'deposit_confirmation_email',
      channel: 'email',
      recipient: booking.guest_email,
      sendFn: () => sendEmail({ to: booking.guest_email!, ...rendered }),
    });
  } catch (err) {
    console.error('[send-templated] deposit confirmation email error:', err);
    return { sent: false, reason: 'error' };
  }
}
