import twilio, { type Twilio } from 'twilio';

let client: Twilio | null = null;

function getEnv() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!accountSid || !authToken) {
    throw new Error(
      'TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN must be set. Use Twilio only on the server; never expose the Auth Token to the client.'
    );
  }
  return { accountSid, authToken };
}

/**
 * Server-only Twilio client. Use this in API routes, server actions, and
 * background jobs only. Never import this file into client components or
 * expose the Auth Token to the browser.
 *
 * SMS is used for: booking confirmations, deposit receipts, payment
 * reminders (2h after request), confirm-or-cancel prompts (24h before),
 * and no-show notifications. See PRD §3.6 and the communications
 * abstraction layer (lib/communications/) for routing.
 */
export function getTwilioClient(): Twilio {
  if (!client) {
    const { accountSid, authToken } = getEnv();
    client = twilio(accountSid, authToken);
  }
  return client;
}
