/**
 * Normalise user-entered website input for storage (http/https URL or null).
 * Accepts: example.com, www.example.com, https://example.com, http://example.com,
 * protocol-relative //example.com, and paths/query strings.
 */
export function normalizeWebsiteUrlForStorage(raw: string): string | null {
  let t = raw.trim();
  if (!t) return null;

  // Protocol-relative URLs (//example.com)
  if (t.startsWith('//')) {
    t = `https:${t}`;
  } else if (!/^https?:\/\//i.test(t)) {
    t = `https://${t}`;
  }

  try {
    const u = new URL(t);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    // Require a non-empty hostname (not just "https:///")
    if (!u.hostname || u.hostname.length === 0) return null;
    return u.href;
  } catch {
    return null;
  }
}

export function isValidWebsiteUrlInput(raw: string): boolean {
  if (!raw.trim()) return true;
  return normalizeWebsiteUrlForStorage(raw) !== null;
}

/** Short label for links (e.g. example.com). */
export function displayLabelForWebsiteUrl(href: string): string {
  try {
    const host = new URL(href).hostname;
    return host.replace(/^www\./i, '') || 'website';
  } catch {
    return 'website';
  }
}
