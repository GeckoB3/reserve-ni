import { getTwilioClient } from '@/lib/twilio';

function getFromNumber(): string {
  const fromNumber = process.env.TWILIO_PHONE_NUMBER;
  if (!fromNumber) {
    throw new Error('TWILIO_PHONE_NUMBER is not set');
  }
  return fromNumber;
}

/**
 * Send an SMS to a recipient. Use this from server-side code only (API routes,
 * server actions, jobs). For booking workflows, prefer the communications
 * abstraction layer (lib/communications/) so templates and logging are
 * consistent.
 *
 * @param to - E.164 phone number (e.g. +447700900000)
 * @param body - Message text (max 1600 chars for a single segment)
 * @returns Twilio message SID on success
 */
export async function sendSMS(
  to: string,
  body: string
): Promise<{ sid: string }> {
  const message = await getTwilioClient().messages.create({
    body,
    from: getFromNumber(),
    to,
  });
  return { sid: message.sid };
}
