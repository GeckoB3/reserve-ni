import sgMail from '@sendgrid/mail';

const apiKey = process.env.SENDGRID_API_KEY;
const fromEmail = process.env.SENDGRID_FROM_EMAIL ?? 'hello@reserveni.com';

if (apiKey) {
  sgMail.setApiKey(apiKey);
}

interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  text: string;
}

/**
 * Send an email via SendGrid with pre-rendered HTML content.
 * Returns the SendGrid message ID on success, null if not configured.
 */
export async function sendEmail(opts: SendEmailOptions): Promise<string | null> {
  if (!opts.to?.trim()) return null;

  if (!apiKey) {
    console.log('[sendEmail] SENDGRID_API_KEY not set; would send:', { to: opts.to, subject: opts.subject });
    return null;
  }

  try {
    const [response] = await sgMail.send({
      to: opts.to,
      from: fromEmail,
      subject: opts.subject,
      text: opts.text,
      html: opts.html,
    });
    const messageId = response?.headers?.['x-message-id'] as string | undefined;
    return messageId ?? null;
  } catch (err: unknown) {
    const sgErr = err as { code?: number; response?: { body?: unknown } };
    if (sgErr?.response?.body) {
      console.error('[sendEmail] SendGrid error body:', JSON.stringify(sgErr.response.body));
    }
    throw err;
  }
}
