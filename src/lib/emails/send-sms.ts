import { getTwilioClient } from '@/lib/twilio';
import { estimateSmsSegments } from '@/lib/sms-usage';

function normaliseToE164(phone: string): string {
  const cleaned = phone.replace(/[\s\-()]/g, '');
  if (cleaned.startsWith('+')) return cleaned;
  if (cleaned.startsWith('00')) return '+' + cleaned.slice(2);
  if (cleaned.startsWith('0')) return '+44' + cleaned.slice(1);
  if (cleaned.startsWith('44')) return '+' + cleaned;
  return '+' + cleaned;
}

export interface SendSmsResult {
  sid: string | null;
  /** Prefer Twilio-reported segments (plan §4.6); fall back to GSM/UCS-2 estimate. */
  segmentCount: number;
}

/**
 * Send SMS via Twilio; returns SID and segment count for billing accuracy.
 */
export async function sendSmsWithSegments(to: string, body: string): Promise<SendSmsResult> {
  const fallbackSegments = estimateSmsSegments(body);
  if (!to?.trim()) return { sid: null, segmentCount: fallbackSegments };

  const fromNumber = process.env.TWILIO_PHONE_NUMBER;
  if (!fromNumber) {
    console.warn('[sendSms] TWILIO_PHONE_NUMBER not set; skipping SMS');
    return { sid: null, segmentCount: fallbackSegments };
  }

  let client;
  try {
    client = getTwilioClient();
  } catch {
    console.warn('[sendSms] Twilio not configured; skipping SMS');
    return { sid: null, segmentCount: fallbackSegments };
  }

  const toNorm = normaliseToE164(to);
  const fromNorm = normaliseToE164(fromNumber);

  const message = await client.messages.create({
    body,
    from: fromNorm,
    to: toNorm,
  });

  const raw = (message as { numSegments?: string | number }).numSegments;
  let segmentCount = fallbackSegments;
  if (typeof raw === 'number' && raw >= 1) {
    segmentCount = raw;
  } else if (typeof raw === 'string') {
    const p = parseInt(raw, 10);
    if (p >= 1) segmentCount = p;
  }

  return { sid: message.sid ?? null, segmentCount };
}

/**
 * Send an SMS via Twilio.
 * Returns the Twilio message SID on success, null if not configured.
 */
export async function sendSms(to: string, body: string): Promise<string | null> {
  const { sid } = await sendSmsWithSegments(to, body);
  return sid;
}
