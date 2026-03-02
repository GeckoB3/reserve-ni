import twilio from 'twilio';
import type { MessageChannel, Recipient, CompiledTemplate, TemplateVariables } from '../types';

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const fromNumber = process.env.TWILIO_PHONE_NUMBER;

const client = accountSid && authToken ? twilio(accountSid, authToken) : null;

export class SMSChannel implements MessageChannel {
  async send(recipient: Recipient, template: CompiledTemplate, variables: TemplateVariables): Promise<void> {
    const phone = recipient.phone;
    if (!phone?.trim()) return;

    if (!client || !fromNumber) {
      console.log('[SMSChannel] Twilio not configured; would send:', { to: phone, body: template.body?.slice(0, 50) });
      return;
    }

    await client.messages.create({
      body: template.body,
      from: fromNumber,
      to: phone,
    });
  }
}
