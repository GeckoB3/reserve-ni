/**
 * Read fields from Stripe Subscription objects without relying on SDK generics
 * (some Stripe client versions type API responses as Response<T> without indexing).
 */

export function subscriptionPeriodEndIso(sub: unknown): string | null {
  if (!sub || typeof sub !== 'object') return null;
  const cpe = (sub as { current_period_end?: number }).current_period_end;
  if (typeof cpe !== 'number') return null;
  return new Date(cpe * 1000).toISOString();
}

export function subscriptionPeriodStartIso(sub: unknown): string | null {
  if (!sub || typeof sub !== 'object') return null;
  const cps = (sub as { current_period_start?: number }).current_period_start;
  if (typeof cps !== 'number') return null;
  return new Date(cps * 1000).toISOString();
}

export function subscriptionCancelAtPeriodEnd(sub: unknown): boolean {
  if (!sub || typeof sub !== 'object') return false;
  return Boolean((sub as { cancel_at_period_end?: boolean }).cancel_at_period_end);
}

export function subscriptionStatus(sub: unknown): string | undefined {
  if (!sub || typeof sub !== 'object') return undefined;
  const s = (sub as { status?: string }).status;
  return typeof s === 'string' ? s : undefined;
}
