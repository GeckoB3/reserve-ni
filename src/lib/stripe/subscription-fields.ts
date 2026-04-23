/**
 * Read fields from Stripe Subscription objects safely. Inputs are typed as
 * a structural subset because the Stripe SDK's `Response<T>` wrapper does
 * not always index into resource fields directly (varies by client version).
 */

interface SubscriptionFields {
  current_period_end?: number;
  current_period_start?: number;
  cancel_at_period_end?: boolean;
  status?: string;
}

function asFields(sub: unknown): SubscriptionFields | null {
  return sub && typeof sub === 'object' ? (sub as SubscriptionFields) : null;
}

export function subscriptionPeriodEndIso(sub: unknown): string | null {
  const f = asFields(sub);
  if (!f || typeof f.current_period_end !== 'number') return null;
  return new Date(f.current_period_end * 1000).toISOString();
}

export function subscriptionPeriodStartIso(sub: unknown): string | null {
  const f = asFields(sub);
  if (!f || typeof f.current_period_start !== 'number') return null;
  return new Date(f.current_period_start * 1000).toISOString();
}

export function subscriptionCancelAtPeriodEnd(sub: unknown): boolean {
  const f = asFields(sub);
  return Boolean(f?.cancel_at_period_end);
}

export function subscriptionStatus(sub: unknown): string | undefined {
  const f = asFields(sub);
  return typeof f?.status === 'string' ? f.status : undefined;
}
