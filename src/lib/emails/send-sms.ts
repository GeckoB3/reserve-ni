import { getTwilioClient } from '@/lib/twilio';

function normaliseToE164(phone: string): string {
  const cleaned = phone.replace(/[\s\-()]/g, '');
  if (cleaned.startsWith('+')) return cleaned;
  if (cleaned.startsWith('00')) return '+' + cleaned.slice(2);
  if (cleaned.startsWith('0')) return '+44' + cleaned.slice(1);
  if (cleaned.startsWith('44')) return '+' + cleaned;
  return '+' + cleaned;
}

/**
 * Send an SMS via Twilio.
 * Returns the Twilio message SID on success, null if not configured.
 */
export async function sendSms(to: string, body: string): Promise<string | null> {
  if (!to?.trim()) return null;

  const fromNumber = process.env.TWILIO_PHONE_NUMBER;
  if (!fromNumber) {
    console.warn('[sendSms] TWILIO_PHONE_NUMBER not set; skipping SMS');
    return null;
  }

  let client;
  try {
    client = getTwilioClient();
  } catch {
    console.warn('[sendSms] Twilio not configured; skipping SMS');
    return null;
  }

  const toNorm = normaliseToE164(to);
  const fromNorm = normaliseToE164(fromNumber);

  const message = await client.messages.create({
    body,
    from: fromNorm,
    to: toNorm,
  });

  return message.sid ?? null;
}
