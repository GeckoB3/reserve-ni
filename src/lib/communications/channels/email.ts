import sgMail from '@sendgrid/mail';
import type { MessageChannel, Recipient, CompiledTemplate, TemplateVariables } from '../types';

const apiKey = process.env.SENDGRID_API_KEY;
const fromEmail = process.env.SENDGRID_FROM_EMAIL ?? 'bookings@reserveni.com';

if (apiKey) {
  sgMail.setApiKey(apiKey);
}

/** Convert plain-text email body to simple branded HTML, with links turned into buttons. */
function textToHtml(text: string): string {
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Collect URLs that get turned into buttons so we don't double-link them.
  const buttonUrls = new Set<string>();

  // Turn "View or cancel your booking: URL" or "Manage your booking: URL" or "Pay your deposit here: URL" into a button.
  const withButtons = escaped.replace(
    /((?:View or cancel your booking|Manage your booking|Pay your deposit here):\s*)(https?:\/\/[^\s]+)/gi,
    (_match, label, url) => {
      buttonUrls.add(url as string);
      const cleanLabel = (label as string).replace(/:\s*$/, '');
      return `<a href="${url}" style="display:inline-block;background-color:#4E6B78;color:#ffffff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;margin:8px 0">${cleanLabel}</a>`;
    },
  );

  // Turn remaining bare URLs into clickable links, skipping any already converted to buttons.
  const withLinks = withButtons.replace(
    /(?<!=["'])(https?:\/\/[^\s<>"']+)/g,
    (url) => buttonUrls.has(url) ? url : `<a href="${url}" style="color:#4E6B78">${url}</a>`,
  );

  return `<!DOCTYPE html><html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1e293b;line-height:1.6;padding:24px;max-width:560px;margin:0 auto"><div style="border-bottom:3px solid #4E6B78;padding-bottom:16px;margin-bottom:24px"><img src="https://reserveni.com/Logo.png" alt="Reserve NI" style="height:32px" /></div>${withLinks.replace(/\n/g, '<br>')}<div style="margin-top:32px;padding-top:16px;border-top:1px solid #e2e8f0;font-size:12px;color:#94a3b8"><a href="https://reserveni.com/privacy" style="color:#94a3b8">Privacy</a> &middot; <a href="https://reserveni.com/terms" style="color:#94a3b8">Terms</a></div></body></html>`;
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
        html: textToHtml(template.body),
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
