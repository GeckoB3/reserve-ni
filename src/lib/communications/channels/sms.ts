import { getTwilioClient } from '@/lib/twilio';
import { normalizeToE164, normalizeToE164Lenient } from '@/lib/phone/e164';
import type { MessageChannel, Recipient, CompiledTemplate, TemplateVariables } from '../types';

function toTwilioE164(raw: string, label: 'recipient' | 'from'): string | null {
  const cleaned = raw.replace(/[\s\-()]/g, '').trim();
  if (!cleaned) return null;
  const strict = normalizeToE164(cleaned, 'GB') ?? normalizeToE164(cleaned);
  if (strict) return strict;
  const lenient = normalizeToE164Lenient(cleaned, 'GB') ?? normalizeToE164Lenient(cleaned);
  if (lenient) return lenient;
  console.warn(`[SMSChannel] Invalid ${label} phone; skipping send (original: ${raw})`);
  return null;
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

    const to = toTwilioE164(phone, 'recipient');
    if (!to) return;

    const from = toTwilioE164(fromNumber, 'from');
    if (!from) {
      console.warn('[SMSChannel] Invalid TWILIO_PHONE_NUMBER; skipping SMS');
      return;
    }

    console.log(`[SMSChannel] Sending to ${to} (original: ${phone})`);

    await client.messages.create({
      body: template.body,
      from,
      to,
    });
  }
}
