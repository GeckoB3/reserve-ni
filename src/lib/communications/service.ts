import type { MessageType, Recipient, TemplateVariables, MessageChannel } from './types';
import { compileEmailTemplate, compileSmsTemplate } from './templates';
import { EmailChannel } from './channels/email';
import { SMSChannel } from './channels/sms';

/** Which channels each message type uses. Adding WhatsApp = add channel and add to this map. */
const MESSAGE_CHANNELS: Record<MessageType, Array<'email' | 'sms'>> = {
  booking_confirmation: ['email'],
  deposit_payment_request: ['sms'],
  deposit_payment_reminder: ['sms'],
  pre_visit_reminder: ['email'],
  confirm_or_cancel_prompt: ['sms'],
  dietary_digest: ['email'],
  post_visit_thankyou: ['email'],
  auto_cancel_notification: ['email', 'sms'],
  booking_modification: ['email'],
  cancellation_confirmation: ['email'],
  no_show_notification: ['email'],
};

const emailChannel: MessageChannel = new EmailChannel();
const smsChannel: MessageChannel = new SMSChannel();

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
  return p;
}

export class CommunicationService {
  async send(type: MessageType, recipient: Recipient, payload: TemplateVariables): Promise<void> {
    const channels = MESSAGE_CHANNELS[type];
    if (!channels?.length) {
      console.warn('[CommunicationService] No channels for type', type);
      return;
    }

    const vars = normalisePayload(payload);

    for (const ch of channels) {
      try {
        if (ch === 'email') {
          const compiled = compileEmailTemplate(type, vars);
          if (compiled && recipient.email) {
            await getChannel('email').send(recipient, { subject: compiled.subject, body: compiled.body }, payload);
          }
        } else {
          const body = compileSmsTemplate(type, vars);
          if (body && recipient.phone) {
            await getChannel('sms').send(recipient, { body }, payload);
          }
        }
      } catch (err) {
        console.error(`[CommunicationService] ${ch} failed for ${type}:`, err);
        throw err;
      }
    }
  }
}

export const communicationService = new CommunicationService();
