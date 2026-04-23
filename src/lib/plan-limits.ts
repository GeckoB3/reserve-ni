/**
 * Sync plan limits by `venues.pricing_tier` (lowercase).
 * Used by calendar/staff enforcement and tests.
 */

export function planCalendarLimit(pricingTier: string | null | undefined): number {
  const t = (pricingTier ?? '').toLowerCase().trim();
  if (t === 'light') return 1;
  if (t === 'plus') return 5;
  return Infinity;
}

export function planStaffLimit(pricingTier: string | null | undefined): number {
  const t = (pricingTier ?? '').toLowerCase().trim();
  if (t === 'light') return 1;
  if (t === 'plus') return 5;
  return Infinity;
}
