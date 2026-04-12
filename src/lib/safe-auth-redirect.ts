const DEFAULT_AUTH_NEXT = '/dashboard';

/**
 * Restricts open redirects from auth query params to same-origin paths only.
 */
export function sanitizeAuthNextPath(raw: string | null | undefined): string {
  if (!raw || typeof raw !== 'string') return DEFAULT_AUTH_NEXT;
  const next = raw.trim();
  if (!next.startsWith('/') || next.startsWith('//')) return DEFAULT_AUTH_NEXT;
  return next;
}
