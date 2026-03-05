import { getTwilioClient } from '@/lib/twilio';
import type { MessageChannel, Recipient, CompiledTemplate, TemplateVariables } from '../types';

/**
 * Normalise a phone number to E.164 format for Twilio.
 * Handles UK numbers: 07... -> +447..., 447... -> +447...
 * Passes through numbers already starting with +.
 */
function normaliseToE164(phone: string): string {
  let cleaned = phone.replace(/[\s\-()]/g, '');
  if (cleaned.startsWith('+')) return cleaned;
  if (cleaned.startsWith('00')) {
    return '+' + cleaned.slice(2);
  }
  if (cleaned.startsWith('0')) {
    return '+44' + cleaned.slice(1);
  }
  if (cleaned.startsWith('44')) {
    return '+' + cleaned;
  }
  return '+' + cleaned;
}

export class SMSChannel implements MessageChannel {
  async send(recipient: Recipient, template: CompiledTemplate, _variables: TemplateVariables): Promise<void> {
    const phone = recipient.phone;
    if (!phone?.trim()) return;

    const fromNumber = process.env.TWILIO_PHONE_NUMBER;
    if (!fromNumber) {
      console.warn('[SMSChannel] TWILIO_PHONE_NUMBER not set; skipping SMS');
      return;
    }

    let client;
    try {
      client = getTwilioClient();
    } catch {
      console.warn('[SMSChannel] Twilio not configured; skipping SMS');
      return;
    }

    const to = normaliseToE164(phone);
    const from = normaliseToE164(fromNumber);
    console.log(`[SMSChannel] Sending to ${to} (original: ${phone})`);

    await client.messages.create({
      body: template.body,
      from,
      to,
    });
  }
}
