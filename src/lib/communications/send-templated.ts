/**
 * High-level helpers for sending templated communications with settings checks,
 * dedup via communication_logs, and new HTML templates.
 */
import type { BookingEmailData, VenueEmailData, CommMessageType } from '@/lib/emails/types';
import { renderBookingConfirmation } from '@/lib/emails/templates/booking-confirmation';
import { renderDepositRequestSms } from '@/lib/emails/templates/deposit-request-sms';
import { renderDepositConfirmation } from '@/lib/emails/templates/deposit-confirmation';
import { renderBookingModification, renderBookingModificationSms } from '@/lib/emails/templates/booking-modification';
import { sendEmail } from '@/lib/emails/send-email';
import { sendSms } from '@/lib/emails/send-sms';
import { getCommSettings, logToCommLogs, updateCommLogStatus } from './service';
import { getSupabaseAdminClient } from '@/lib/supabase';

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

/**
 * Upsert a comm log row — modifications can happen multiple times per booking,
 * so we update the existing row rather than failing on the unique constraint.
 */
async function upsertCommLog(opts: {
  venue_id: string;
  booking_id: string;
  message_type: CommMessageType;
  channel: 'email' | 'sms';
  recipient: string;
  status: 'sent' | 'failed';
  external_id?: string | null;
  error_message?: string | null;
}): Promise<void> {
  try {
    const supabase = getSupabaseAdminClient();
    await supabase.from('communication_logs').upsert(
      {
        venue_id: opts.venue_id,
        booking_id: opts.booking_id,
        message_type: opts.message_type,
        channel: opts.channel,
        recipient: opts.recipient,
        status: opts.status,
        external_id: opts.external_id ?? null,
        error_message: opts.error_message ?? null,
        sent_at: opts.status === 'sent' ? new Date().toISOString() : null,
      },
      { onConflict: 'booking_id,message_type' },
    );
  } catch (err) {
    console.error('[upsertCommLog] failed:', err);
  }
}

/**
 * Send booking modification notification email and/or SMS based on venue settings.
 * No dedup — the same booking can be modified multiple times.
 */
export async function sendBookingModificationNotification(
  booking: BookingEmailData,
  venue: VenueEmailData,
  venueId: string,
): Promise<{ email: SendResult; sms: SendResult }> {
  const results: { email: SendResult; sms: SendResult } = {
    email: { sent: false, reason: 'skipped' },
    sms: { sent: false, reason: 'skipped' },
  };

  try {
    const settings = await getCommSettings(venueId);

    if (settings.modification_email_enabled && booking.guest_email) {
      try {
        const rendered = renderBookingModification(booking, venue, settings.modification_custom_message);
        const externalId = await sendEmail({ to: booking.guest_email, ...rendered });
        await upsertCommLog({
          venue_id: venueId,
          booking_id: booking.id,
          message_type: 'booking_modification_email',
          channel: 'email',
          recipient: booking.guest_email,
          status: 'sent',
          external_id: externalId,
        });
        results.email = { sent: true };
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.error('[send-templated] booking modification email failed:', err);
        await upsertCommLog({
          venue_id: venueId,
          booking_id: booking.id,
          message_type: 'booking_modification_email',
          channel: 'email',
          recipient: booking.guest_email!,
          status: 'failed',
          error_message: errMsg,
        });
        results.email = { sent: false, reason: 'send_error' };
      }
    } else if (!booking.guest_email) {
      results.email = { sent: false, reason: 'no_email' };
    } else {
      results.email = { sent: false, reason: 'disabled' };
    }

    if (settings.modification_sms_enabled && booking.guest_phone) {
      try {
        const rendered = renderBookingModificationSms(booking, venue, settings.modification_custom_message);
        await sendSms(booking.guest_phone, rendered.body);
        await upsertCommLog({
          venue_id: venueId,
          booking_id: booking.id,
          message_type: 'booking_modification_sms',
          channel: 'sms',
          recipient: booking.guest_phone,
          status: 'sent',
        });
        results.sms = { sent: true };
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.error('[send-templated] booking modification SMS failed:', err);
        await upsertCommLog({
          venue_id: venueId,
          booking_id: booking.id,
          message_type: 'booking_modification_sms',
          channel: 'sms',
          recipient: booking.guest_phone!,
          status: 'failed',
          error_message: errMsg,
        });
        results.sms = { sent: false, reason: 'send_error' };
      }
    } else if (!booking.guest_phone) {
      results.sms = { sent: false, reason: 'no_phone' };
    } else {
      results.sms = { sent: false, reason: 'disabled' };
    }
  } catch (err) {
    console.error('[send-templated] booking modification notification error:', err);
  }

  return results;
}
