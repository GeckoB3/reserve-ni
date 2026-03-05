import sgMail from '@sendgrid/mail';
import type { MessageChannel, Recipient, CompiledTemplate, TemplateVariables } from '../types';

const apiKey = process.env.SENDGRID_API_KEY;
const fromEmail = process.env.SENDGRID_FROM_EMAIL ?? 'bookings@reserveni.com';

if (apiKey) {
  sgMail.setApiKey(apiKey);
}

export class EmailChannel implements MessageChannel {
  async send(recipient: Recipient, template: CompiledTemplate, variables: TemplateVariables): Promise<void> {
    const email = recipient.email;
    if (!email?.trim()) return;

    if (!apiKey) {
      console.log('[EmailChannel] SENDGRID_API_KEY not set; would send:', { to: email, subject: template.subject });
      return;
    }

    try {
      await sgMail.send({
        to: email,
        from: fromEmail,
        subject: template.subject ?? 'Reserve NI',
        text: template.body,
      });
    } catch (err: unknown) {
      // Extract SendGrid's detailed error body for easier diagnosis.
      const sgErr = err as { code?: number; response?: { body?: unknown } };
      if (sgErr?.response?.body) {
        console.error('[EmailChannel] SendGrid error body:', JSON.stringify(sgErr.response.body));
      }
      throw err;
    }
  }
}
