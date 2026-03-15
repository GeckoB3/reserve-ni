const BRAND = '#4E6B78';
const GREY_BG = '#F5F5F5';
const AMBER_BG = '#FFF3CD';
const AMBER_TEXT = '#664D03';
const FOOTER_TEXT = '#888888';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

interface BaseTemplateOptions {
  venueName: string;
  venueLogoUrl?: string | null;
  heading: string;
  mainContent: string;
  bookingDate?: string;
  bookingTime?: string;
  partySize?: number;
  venueAddress?: string | null;
  specialRequests?: string | null;
  depositInfoHtml?: string | null;
  customMessage?: string | null;
  ctaLabel?: string;
  ctaUrl?: string | null;
  footerNote?: string;
}

function baseUrl(): string {
  return process.env.NEXT_PUBLIC_BASE_URL || 'https://www.reserveni.com';
}

export function buildBookingDetailsCard(opts: {
  bookingDate?: string;
  bookingTime?: string;
  partySize?: number;
  venueAddress?: string | null;
  specialRequests?: string | null;
}): string {
  const rows: string[] = [];
  if (opts.bookingDate) rows.push(`<tr><td style="padding:4px 0;font-size:14px;color:#333">&#128197; ${escapeHtml(opts.bookingDate)}</td></tr>`);
  if (opts.bookingTime) rows.push(`<tr><td style="padding:4px 0;font-size:14px;color:#333">&#128336; ${escapeHtml(opts.bookingTime)}</td></tr>`);
  if (opts.partySize) rows.push(`<tr><td style="padding:4px 0;font-size:14px;color:#333">&#128101; ${opts.partySize} guest${opts.partySize !== 1 ? 's' : ''}</td></tr>`);
  if (opts.venueAddress) rows.push(`<tr><td style="padding:4px 0;font-size:14px;color:#333">&#128205; ${escapeHtml(opts.venueAddress)}</td></tr>`);
  if (opts.specialRequests) rows.push(`<tr><td style="padding:4px 0;font-size:14px;color:#333">&#128221; ${escapeHtml(opts.specialRequests)}</td></tr>`);
  if (rows.length === 0) return '';
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:${GREY_BG};border:1px solid #E5E5E5;border-radius:8px;margin:16px 0"><tr><td style="padding:16px">${rows.join('')}</td></tr></table>`;
}

export function buildDepositCallout(amount: string, refundCutoff?: string | null): string {
  let text = `Your deposit of £${escapeHtml(amount)} has been received.`;
  if (refundCutoff) {
    text += ` Your deposit is fully refundable if you cancel before ${escapeHtml(refundCutoff)}. After this time, the deposit is non-refundable.`;
  }
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:${AMBER_BG};border:1px solid #FFE69C;border-radius:8px;margin:16px 0"><tr><td style="padding:16px;font-size:14px;color:${AMBER_TEXT}">${text}</td></tr></table>`;
}

export function buildCtaButton(label: string, url: string): string {
  return [
    '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0">',
    '<tr><td style="background-color:' + BRAND + ';border-radius:8px;text-align:center">',
    `<a href="${escapeHtml(url)}" target="_blank" style="display:inline-block;padding:16px 32px;color:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:14px;font-weight:600;text-decoration:none">${escapeHtml(label)}</a>`,
    '</td></tr></table>',
  ].join('');
}

export function renderBaseTemplate(opts: BaseTemplateOptions): string {
  const base = baseUrl();
  const logoHtml = opts.venueLogoUrl
    ? `<img src="${escapeHtml(opts.venueLogoUrl)}" alt="${escapeHtml(opts.venueName)}" width="140" style="height:auto;display:block;margin-bottom:8px" />`
    : `<span style="font-size:18px;font-weight:700;color:${BRAND}">${escapeHtml(opts.venueName)}</span>`;

  const bookingCard = buildBookingDetailsCard({
    bookingDate: opts.bookingDate,
    bookingTime: opts.bookingTime,
    partySize: opts.partySize,
    venueAddress: opts.venueAddress,
    specialRequests: opts.specialRequests,
  });

  const depositSection = opts.depositInfoHtml ?? '';

  const customSection = opts.customMessage
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:16px 0"><tr><td style="padding:16px;background-color:#F0F9FF;border-radius:8px;font-size:14px;color:#1E40AF;font-style:italic">${escapeHtml(opts.customMessage)}</td></tr></table>`
    : '';

  const ctaSection = opts.ctaUrl && opts.ctaLabel ? buildCtaButton(opts.ctaLabel, opts.ctaUrl) : '';

  const footer = opts.footerNote ?? `You received this email because you have a booking at ${escapeHtml(opts.venueName)}.`;

  return [
    '<!DOCTYPE html>',
    '<html lang="en">',
    '<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>',
    '<body style="margin:0;padding:0;background-color:#f8fafc">',
    '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#f8fafc">',
    '<tr><td align="center" style="padding:24px 16px">',
    '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="560" style="max-width:560px;width:100%;background-color:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0">',

    // Header bar
    `<tr><td style="padding:20px 24px;background-color:${BRAND}">`,
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td>`,
    opts.venueLogoUrl
      ? `<img src="${escapeHtml(opts.venueLogoUrl)}" alt="${escapeHtml(opts.venueName)}" width="120" style="height:auto;display:block" />`
      : `<span style="font-size:18px;font-weight:700;color:#ffffff">${escapeHtml(opts.venueName)}</span>`,
    '</td></tr></table>',
    '</td></tr>',

    // Body
    `<tr><td style="padding:32px 24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:15px;line-height:1.6;color:#1e293b">`,
    `<h1 style="margin:0 0 16px 0;font-size:22px;font-weight:700;color:#0f172a">${escapeHtml(opts.heading)}</h1>`,
    opts.mainContent,
    bookingCard,
    depositSection,
    customSection,
    ctaSection,
    '</td></tr>',

    // Footer
    `<tr><td style="padding:20px 24px;border-top:1px solid #e2e8f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:12px;color:${FOOTER_TEXT}">`,
    `<p style="margin:0 0 8px 0">Powered by <a href="${base}" target="_blank" style="color:${BRAND};text-decoration:none;font-weight:600">ReserveNI</a></p>`,
    `<p style="margin:0;color:#aaa">${escapeHtml(footer)}</p>`,
    '</td></tr>',

    '</table>',
    '</td></tr></table>',
    '</body></html>',
  ].join('\n');
}

export function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr + 'T00:00:00');
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

export function formatTime(timeStr: string): string {
  try {
    const [h, m] = timeStr.slice(0, 5).split(':').map(Number);
    const ampm = (h ?? 0) >= 12 ? 'pm' : 'am';
    const h12 = (h ?? 0) % 12 || 12;
    return `${h12}:${String(m ?? 0).padStart(2, '0')}${ampm}`;
  } catch {
    return timeStr.slice(0, 5);
  }
}

export function formatDepositAmount(pence: number): string {
  return (pence / 100).toFixed(2);
}
