import type { MessageType, Recipient, TemplateVariables, MessageChannel } from './types';
import { compileEmailTemplate, compileSmsTemplate } from './templates';
import { EmailChannel } from './channels/email';
import { SMSChannel } from './channels/sms';
import { getSupabaseAdminClient } from '@/lib/supabase';

interface LogContext {
  venue_id?: string;
  booking_id?: string;
  guest_id?: string;
}

/** Which channels each message type uses. Adding WhatsApp = add channel and add to this map. */
const MESSAGE_CHANNELS: Record<MessageType, Array<'email' | 'sms'>> = {
  booking_confirmation: ['email', 'sms'],
  deposit_payment_request: ['email', 'sms'],
  deposit_payment_reminder: ['sms'],
  pre_visit_reminder: ['email', 'sms'],
  confirm_or_cancel_prompt: ['sms'],
  dietary_digest: ['email'],
  post_visit_thankyou: ['email'],
  auto_cancel_notification: ['email', 'sms'],
  booking_modification: ['email', 'sms'],
  cancellation_confirmation: ['email', 'sms'],
  no_show_notification: ['email'],
  custom_message: ['email', 'sms'],
};

const emailChannel: MessageChannel = new EmailChannel();
const smsChannel: MessageChannel = new SMSChannel();
const DEDUPED_MESSAGE_TYPES = new Set<MessageType>([
  'booking_confirmation',
  'deposit_payment_reminder',
  'pre_visit_reminder',
  'confirm_or_cancel_prompt',
  'auto_cancel_notification',
  'cancellation_confirmation',
  'no_show_notification',
]);

function getChannel(ch: 'email' | 'sms'): MessageChannel {
  return ch === 'email' ? emailChannel : smsChannel;
}

function normalisePayload(payload: TemplateVariables): Record<string, string | number | undefined> {
  const p = { ...payload } as Record<string, string | number | undefined>;
  if (p.deposit_amount_pence != null && p.deposit_amount == null) {
    p.deposit_amount = (Number(p.deposit_amount_pence) / 100).toFixed(2);
  }
  if (p.booking_time != null && typeof p.booking_time === 'string' && p.booking_time.length > 5) {
    p.booking_time = p.booking_time.slice(0, 5);
  }
  // Convert YYYY-MM-DD dates to DD/MM/YYYY for human-readable messages.
  if (typeof p.booking_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(p.booking_date)) {
    const [y, m, d] = p.booking_date.split('-');
    p.booking_date = `${d}/${m}/${y}`;
  }
  // Format the cancellation deadline as DD/MM/YYYY at HH:MM for readability.
  if (typeof p.cancellation_deadline === 'string' && p.cancellation_deadline.includes('T')) {
    try {
      const dt = new Date(p.cancellation_deadline);
      const dd = String(dt.getDate()).padStart(2, '0');
      const mm = String(dt.getMonth() + 1).padStart(2, '0');
      const yyyy = dt.getFullYear();
      const hh = String(dt.getHours()).padStart(2, '0');
      const min = String(dt.getMinutes()).padStart(2, '0');
      p.cancellation_deadline = `${dd}/${mm}/${yyyy} at ${hh}:${min}`;
    } catch {
      // leave as-is if parsing fails
    }
  }
  return p;
}

export class CommunicationService {
  private async isDuplicateSend(
    type: MessageType,
    channel: 'email' | 'sms',
    ctx: LogContext
  ): Promise<boolean> {
    if (!ctx.venue_id) return false;
    if (!ctx.booking_id && !ctx.guest_id) return false;
    try {
      const supabase = getSupabaseAdminClient();
      let query = supabase
        .from('communications')
        .select('id')
        .eq('venue_id', ctx.venue_id)
        .eq('message_type', type)
        .eq('channel', channel)
        .eq('status', 'sent')
        .limit(1);
      if (ctx.booking_id) {
        query = query.eq('booking_id', ctx.booking_id);
      } else if (ctx.guest_id) {
        query = query.eq('guest_id', ctx.guest_id);
      }
      const { data } = await query.maybeSingle();
      return Boolean(data);
    } catch (err) {
      console.error('[CommunicationService] dedupe check failed, continuing send:', err);
      return false;
    }
  }

  private async logCommunication(
    type: MessageType,
    channel: string,
    recipient: Recipient,
    status: 'sent' | 'failed',
    ctx: LogContext,
  ): Promise<void> {
    try {
      if (!ctx.venue_id) return;
      const supabase = getSupabaseAdminClient();
      await supabase.from('communications').insert({
        venue_id: ctx.venue_id,
        booking_id: ctx.booking_id ?? null,
        guest_id: ctx.guest_id ?? null,
        message_type: type,
        channel,
        recipient_email: recipient.email ?? null,
        recipient_phone: recipient.phone ?? null,
        status,
      });
    } catch (logErr) {
      console.error('[CommunicationService] Failed to log communication:', logErr);
    }
  }

  async send(type: MessageType, recipient: Recipient, payload: TemplateVariables, ctx: LogContext = {}): Promise<void> {
    const channels = MESSAGE_CHANNELS[type];
    if (!channels?.length) {
      console.warn('[CommunicationService] No channels for type', type);
      return;
    }

    const vars = normalisePayload(payload);

    for (const ch of channels) {
      try {
        if (DEDUPED_MESSAGE_TYPES.has(type)) {
          const duplicate = await this.isDuplicateSend(type, ch, ctx);
          if (duplicate) continue;
        }
        if (ch === 'email') {
          const compiled = compileEmailTemplate(type, vars);
          if (compiled && recipient.email) {
            await getChannel('email').send(recipient, { subject: compiled.subject, body: compiled.body }, payload);
            await this.logCommunication(type, 'email', recipient, 'sent', ctx);
          }
        } else {
          const body = compileSmsTemplate(type, vars);
          if (body && recipient.phone) {
            await getChannel('sms').send(recipient, { body }, payload);
            await this.logCommunication(type, 'sms', recipient, 'sent', ctx);
          }
        }
      } catch (err) {
        // Log the failure but continue to the next channel so one failing channel
        // (e.g. SendGrid not yet activated) does not prevent SMS from being sent.
        console.error(`[CommunicationService] ${ch} failed for ${type}:`, err);
        await this.logCommunication(type, ch, recipient, 'failed', ctx);
      }
    }
  }
}

export const communicationService = new CommunicationService();
