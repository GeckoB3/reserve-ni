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
  /**
   * When true, disables SendGrid click and open tracking for this message.
   * Required for auth links (magic links, password reset): tracking wraps URLs in
   * `*.sendgrid.net` / branded redirect hosts and breaks Supabase PKCE verification.
   */
  disableTracking?: boolean;
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
      ...(opts.disableTracking
        ? {
            trackingSettings: {
              clickTracking: { enable: false, enableText: false },
              openTracking: { enable: false },
            },
          }
        : {}),
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
