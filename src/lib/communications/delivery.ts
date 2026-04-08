import { getSupabaseAdminClient } from '@/lib/supabase';
import { sendEmail } from '@/lib/emails/send-email';
import { sendSmsWithSegments } from '@/lib/emails/send-sms';
import { recordOutboundSms } from '@/lib/sms-usage';
import type { CommunicationLane } from './policies';
import type { CommunicationLogMessageType } from './policy-resolver';
import type { RenderedEmail, RenderedSms } from '@/lib/emails/types';

export interface CommunicationDeliveryContext {
  venueId: string;
  bookingId: string;
  lane: CommunicationLane;
  messageType: CommunicationLogMessageType;
  recipient: string;
}

export interface CommunicationSendResult {
  sent: boolean;
  reason?: string;
}

type LogMode = 'dedupe' | 'upsert';

async function insertPending(
  ctx: CommunicationDeliveryContext,
  channel: 'email' | 'sms',
): Promise<boolean> {
  const admin = getSupabaseAdminClient();
  const { error } = await admin.from('communication_logs').insert({
    venue_id: ctx.venueId,
    booking_id: ctx.bookingId,
    communication_lane: ctx.lane,
    message_type: ctx.messageType,
    channel,
    recipient: ctx.recipient,
    status: 'pending',
  });

  if (!error) return true;
  if (error.code === '23505') return false;
  throw error;
}

async function upsertPending(
  ctx: CommunicationDeliveryContext,
  channel: 'email' | 'sms',
): Promise<void> {
  const admin = getSupabaseAdminClient();
  await admin.from('communication_logs').upsert(
    {
      venue_id: ctx.venueId,
      booking_id: ctx.bookingId,
      communication_lane: ctx.lane,
      message_type: ctx.messageType,
      channel,
      recipient: ctx.recipient,
      status: 'pending',
      sent_at: null,
      error_message: null,
      external_id: null,
    },
    { onConflict: 'booking_id,message_type,communication_lane' },
  );
}

async function updateStatus(
  ctx: CommunicationDeliveryContext,
  status: 'sent' | 'failed',
  externalId?: string | null,
  errorMessage?: string | null,
): Promise<void> {
  const admin = getSupabaseAdminClient();
  await admin
    .from('communication_logs')
    .update({
      status,
      external_id: externalId ?? null,
      error_message: errorMessage ?? null,
      sent_at: status === 'sent' ? new Date().toISOString() : null,
    })
    .eq('booking_id', ctx.bookingId)
    .eq('message_type', ctx.messageType)
    .eq('communication_lane', ctx.lane);
}

export async function deliverEmailMessage(
  ctx: CommunicationDeliveryContext,
  rendered: RenderedEmail,
  mode: LogMode,
): Promise<CommunicationSendResult> {
  try {
    if (mode === 'dedupe') {
      const inserted = await insertPending(ctx, 'email');
      if (!inserted) return { sent: false, reason: 'duplicate' };
    } else {
      await upsertPending(ctx, 'email');
    }

    const externalId = await sendEmail({
      to: ctx.recipient,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
    });
    await updateStatus(ctx, 'sent', externalId);
    return { sent: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[deliverEmailMessage] failed:', error);
    await updateStatus(ctx, 'failed', null, message);
    return { sent: false, reason: 'send_error' };
  }
}

export async function deliverSmsMessage(
  ctx: CommunicationDeliveryContext,
  rendered: RenderedSms,
  mode: LogMode,
): Promise<CommunicationSendResult> {
  try {
    if (mode === 'dedupe') {
      const inserted = await insertPending(ctx, 'sms');
      if (!inserted) return { sent: false, reason: 'duplicate' };
    } else {
      await upsertPending(ctx, 'sms');
    }

    const { sid, segmentCount } = await sendSmsWithSegments(
      ctx.recipient,
      rendered.body,
    );

    if (!sid) {
      const detail =
        'SMS did not send (Twilio not configured, invalid number, or empty message). Check TWILIO_* env vars.';
      await updateStatus(ctx, 'failed', null, detail);
      return { sent: false, reason: 'send_error' };
    }

    await updateStatus(ctx, 'sent', sid);
    await recordOutboundSms({
      venueId: ctx.venueId,
      bookingId: ctx.bookingId,
      messageType: ctx.messageType,
      recipientPhone: ctx.recipient,
      twilioSid: sid,
      segmentCount,
    });
    return { sent: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[deliverSmsMessage] failed:', error);
    await updateStatus(ctx, 'failed', null, message);
    return { sent: false, reason: 'send_error' };
  }
}
