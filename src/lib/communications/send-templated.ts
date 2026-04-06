/**
 * High-level helpers for sending templated communications with settings checks,
 * dedup via communication_logs, and new HTML templates.
 */
import type { BookingEmailData, VenueEmailData, CommMessageType } from '@/lib/emails/types';
import { renderBookingConfirmation } from '@/lib/emails/templates/booking-confirmation';
import { renderDepositRequestEmail } from '@/lib/emails/templates/deposit-request-email';
import { renderDepositRequestSms } from '@/lib/emails/templates/deposit-request-sms';
import { renderDepositConfirmation } from '@/lib/emails/templates/deposit-confirmation';
import { renderBookingModification, renderBookingModificationSms } from '@/lib/emails/templates/booking-modification';
import { renderBookingCancellation, renderBookingCancellationSms } from '@/lib/emails/templates/booking-cancellation';
import { sendEmail } from '@/lib/emails/send-email';
import { sendSms, sendSmsWithSegments } from '@/lib/emails/send-sms';
import { recordOutboundSms, estimateSmsSegments } from '@/lib/sms-usage';
import { getCommSettings, logToCommLogs, updateCommLogStatus } from './service';
import { getSupabaseAdminClient } from '@/lib/supabase';
import { isSmsAllowed } from '@/lib/tier-enforcement';
import { isUnifiedSchedulingVenue } from '@/lib/booking/unified-scheduling';
import { isCdeBookingModel } from '@/lib/booking/cde-booking';
import { getVenueNotificationSettings } from '@/lib/notifications/notification-settings';
import { renderBookingConfirmationSms } from '@/lib/emails/templates/booking-confirmation-sms';

interface SendResult {
  sent: boolean;
  reason?: string;
}

async function fetchVenueBookingModel(venueId: string): Promise<string | null> {
  const { data } = await getSupabaseAdminClient()
    .from('venues')
    .select('booking_model')
    .eq('id', venueId)
    .maybeSingle();
  return (data as { booking_model?: string | null } | null)?.booking_model ?? null;
}

async function trySendWithDedup(opts: {
  venueId: string;
  bookingId: string;
  messageType: CommMessageType;
  channel: 'email' | 'sms';
  recipient: string;
  sendFn: () => Promise<string | null>;
  /** When channel is SMS: body used for segment estimate and metering after a successful Twilio send (sid non-null). */
  smsBodyForUsage?: string;
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
    if (opts.channel === 'sms' && opts.smsBodyForUsage && externalId) {
      await recordOutboundSms({
        venueId: opts.venueId,
        bookingId: opts.bookingId,
        messageType: opts.messageType,
        recipientPhone: opts.recipient,
        twilioSid: externalId,
        segmentCount: estimateSmsSegments(opts.smsBodyForUsage),
      });
    }
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
    const venuePrimaryModel = await fetchVenueBookingModel(venueId);
    const settings = await getCommSettings(venueId);

    if (isUnifiedSchedulingVenue(venuePrimaryModel)) {
      if (!settings.confirmation_email_enabled) return { sent: false, reason: 'disabled' };
      const ns = await getVenueNotificationSettings(venueId);
      if (!ns.confirmation_enabled || !ns.confirmation_channels.includes('email')) {
        return { sent: false, reason: 'disabled' };
      }
    } else if (isCdeBookingModel(booking.booking_model)) {
      if (!settings.confirmation_email_enabled) return { sent: false, reason: 'disabled' };
      const ns = await getVenueNotificationSettings(venueId);
      if (!ns.confirmation_enabled || !ns.confirmation_channels.includes('email')) {
        return { sent: false, reason: 'disabled' };
      }
    } else {
      // Table restaurant: same channel gating as unified / CDE (notification_settings + comm settings).
      if (!settings.confirmation_email_enabled) return { sent: false, reason: 'disabled' };
      const ns = await getVenueNotificationSettings(venueId);
      if (!ns.confirmation_enabled || !ns.confirmation_channels.includes('email')) {
        return { sent: false, reason: 'disabled' };
      }
    }

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

/**
 * Unified scheduling / practitioner appointments: confirmation SMS (Message 1) per `notification_settings`.
 */
export async function sendBookingConfirmationSms(
  booking: BookingEmailData,
  venue: VenueEmailData,
  venueId: string,
  guestPhone?: string | null,
): Promise<SendResult> {
  const phone = guestPhone ?? booking.guest_phone;
  if (!phone) return { sent: false, reason: 'no_phone' };

  try {
    const ns = await getVenueNotificationSettings(venueId);
    if (!ns.confirmation_enabled || !ns.confirmation_channels.includes('sms')) {
      return { sent: false, reason: 'disabled' };
    }

    if (!(await isSmsAllowed(venueId))) return { sent: false, reason: 'tier' };

    const rendered = renderBookingConfirmationSms(booking, venue, ns.confirmation_sms_custom_message);

    return trySendWithDedup({
      venueId,
      bookingId: booking.id,
      messageType: 'booking_confirmation_sms',
      channel: 'sms',
      recipient: phone,
      sendFn: () => sendSms(phone, rendered.body),
      smsBodyForUsage: rendered.body,
    });
  } catch (err) {
    console.error('[send-templated] booking confirmation SMS error:', err);
    return { sent: false, reason: 'error' };
  }
}

export async function sendBookingConfirmationNotifications(
  booking: BookingEmailData,
  venue: VenueEmailData,
  venueId: string,
): Promise<{ email: SendResult; sms: SendResult }> {
  const email = await sendBookingConfirmationEmail(booking, venue, venueId);
  const sms = await sendBookingConfirmationSms(booking, venue, venueId);
  return { email, sms };
}

export async function sendDepositRequestEmail(
  booking: BookingEmailData,
  venue: VenueEmailData,
  venueId: string,
  paymentLink: string,
): Promise<SendResult> {
  if (!booking.guest_email) return { sent: false, reason: 'no_email' };

  try {
    const settings = await getCommSettings(venueId);
    if (!settings.deposit_request_email_enabled) return { sent: false, reason: 'disabled' };

    const rendered = renderDepositRequestEmail(
      booking,
      venue,
      paymentLink,
      settings.deposit_request_email_custom_message,
    );

    return trySendWithDedup({
      venueId,
      bookingId: booking.id,
      messageType: 'deposit_request_email',
      channel: 'email',
      recipient: booking.guest_email,
      sendFn: () => sendEmail({ to: booking.guest_email!, ...rendered }),
    });
  } catch (err) {
    console.error('[send-templated] deposit request email error:', err);
    return { sent: false, reason: 'error' };
  }
}

/**
 * Staff / pay-by-link flows only: send deposit request email and/or SMS per settings and tier.
 */
export async function sendDepositRequestNotifications(
  booking: BookingEmailData,
  venue: VenueEmailData,
  venueId: string,
  paymentLink: string,
): Promise<{ email: SendResult; sms: SendResult }> {
  const email = await sendDepositRequestEmail(booking, venue, venueId, paymentLink);
  let sms: SendResult = { sent: false, reason: 'no_phone' };
  if (booking.guest_phone) {
    sms = await sendDepositRequestSms(booking, venue, venueId, paymentLink, booking.guest_phone);
  }
  return { email, sms };
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
    const tierOk = await isSmsAllowed(venueId);
    if (!tierOk) return { sent: false, reason: 'tier' };

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
      smsBodyForUsage: rendered.body,
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
 * Upsert a comm log row - modifications can happen multiple times per booking,
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
 * No dedup - the same booking can be modified multiple times.
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

    const bookingModel = await fetchVenueBookingModel(venueId);
    if (isUnifiedSchedulingVenue(bookingModel)) {
      const ns = await getVenueNotificationSettings(venueId);
      if (!ns.reschedule_notification_enabled) {
        return {
          email: { sent: false, reason: 'disabled' },
          sms: { sent: false, reason: 'disabled' },
        };
      }
    }

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

    if (settings.modification_sms_enabled && booking.guest_phone && (await isSmsAllowed(venueId))) {
      try {
        const rendered = renderBookingModificationSms(booking, venue);
        const { sid, segmentCount } = await sendSmsWithSegments(booking.guest_phone, rendered.body);
        await upsertCommLog({
          venue_id: venueId,
          booking_id: booking.id,
          message_type: 'booking_modification_sms',
          channel: 'sms',
          recipient: booking.guest_phone,
          status: 'sent',
          external_id: sid,
        });
        if (sid) {
          await recordOutboundSms({
            venueId,
            bookingId: booking.id,
            messageType: 'booking_modification_sms',
            recipientPhone: booking.guest_phone,
            twilioSid: sid,
            segmentCount,
          });
        }
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

/**
 * Send booking cancellation notification email and/or SMS based on venue settings.
 * A booking can only be cancelled once, so trySendWithDedup would work, but we
 * use upsert for consistency with the modification pattern.
 */
export async function sendCancellationNotification(
  booking: BookingEmailData,
  venue: VenueEmailData,
  venueId: string,
  refundMessage?: string | null,
): Promise<{ email: SendResult; sms: SendResult }> {
  const results: { email: SendResult; sms: SendResult } = {
    email: { sent: false, reason: 'skipped' },
    sms: { sent: false, reason: 'skipped' },
  };

  try {
    const settings = await getCommSettings(venueId);
    const bookingModel = await fetchVenueBookingModel(venueId);
    const unified = isUnifiedSchedulingVenue(bookingModel);
    const ns = unified ? await getVenueNotificationSettings(venueId) : null;
    if (unified && ns && !ns.cancellation_notification_enabled) {
      return {
        email: { sent: false, reason: 'disabled' },
        sms: { sent: false, reason: 'disabled' },
      };
    }

    if (settings.cancellation_email_enabled && booking.guest_email) {
      try {
        const rendered = renderBookingCancellation(booking, venue, refundMessage, settings.cancellation_custom_message);
        const externalId = await sendEmail({ to: booking.guest_email, ...rendered });
        await upsertCommLog({
          venue_id: venueId,
          booking_id: booking.id,
          message_type: 'cancellation_email',
          channel: 'email',
          recipient: booking.guest_email,
          status: 'sent',
          external_id: externalId,
        });
        results.email = { sent: true };
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.error('[send-templated] cancellation email failed:', err);
        await upsertCommLog({
          venue_id: venueId,
          booking_id: booking.id,
          message_type: 'cancellation_email',
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

    if (
      !unified &&
      settings.cancellation_sms_enabled &&
      booking.guest_phone &&
      (await isSmsAllowed(venueId))
    ) {
      try {
        const rendered = renderBookingCancellationSms(booking, venue, refundMessage);
        const { sid, segmentCount } = await sendSmsWithSegments(booking.guest_phone, rendered.body);
        await upsertCommLog({
          venue_id: venueId,
          booking_id: booking.id,
          message_type: 'cancellation_sms',
          channel: 'sms',
          recipient: booking.guest_phone,
          status: 'sent',
          external_id: sid,
        });
        if (sid) {
          await recordOutboundSms({
            venueId,
            bookingId: booking.id,
            messageType: 'cancellation_sms',
            recipientPhone: booking.guest_phone,
            twilioSid: sid,
            segmentCount,
          });
        }
        results.sms = { sent: true };
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.error('[send-templated] cancellation SMS failed:', err);
        await upsertCommLog({
          venue_id: venueId,
          booking_id: booking.id,
          message_type: 'cancellation_sms',
          channel: 'sms',
          recipient: booking.guest_phone!,
          status: 'failed',
          error_message: errMsg,
        });
        results.sms = { sent: false, reason: 'send_error' };
      }
    } else if (!booking.guest_phone) {
      results.sms = { sent: false, reason: 'no_phone' };
    } else if (unified) {
      results.sms = { sent: false, reason: 'skipped' };
    } else if (!settings.cancellation_sms_enabled) {
      results.sms = { sent: false, reason: 'disabled' };
    } else {
      results.sms = { sent: false, reason: 'tier' };
    }
  } catch (err) {
    console.error('[send-templated] cancellation notification error:', err);
  }

  return results;
}
