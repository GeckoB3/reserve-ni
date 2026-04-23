/** Appointments Pro plan: flat monthly price (GBP). */
export const APPOINTMENTS_PRO_PRICE = 79;

/** @deprecated Use APPOINTMENTS_PRO_PRICE — same value (Pro tier in Stripe). */
export const APPOINTMENTS_PRICE = APPOINTMENTS_PRO_PRICE;

/** Appointments Plus plan: flat monthly price (GBP). */
export const APPOINTMENTS_PLUS_PRICE = 35;

/** Appointments Light plan (GBP). */
export const APPOINTMENTS_LIGHT_PRICE = 6;

/** Restaurant plan: flat monthly price (GBP). */
export const RESTAURANT_PRICE = 79;

/** Guest SMS after included monthly allowance (Stripe metered usage), per message. */
export const SMS_OVERAGE_GBP_PER_MESSAGE = 0.06;

/** Appointments Light: every SMS is metered at this rate (GBP per message). */
export const SMS_LIGHT_GBP_PER_MESSAGE = 0.08;

/** Founding Partner programme cap (restaurants). */
export const FOUNDING_PARTNER_CAP = 20;

/** User-visible plan name from `venues.pricing_tier` (lowercase). */
export function planDisplayName(pricingTier: string | null | undefined): string {
  const t = (pricingTier ?? '').toLowerCase().trim();
  switch (t) {
    case 'light':
      return 'Appointments Light';
    case 'plus':
      return 'Appointments Plus';
    case 'appointments':
      return 'Appointments Pro';
    case 'restaurant':
      return 'Restaurant';
    case 'founding':
      return 'Founding Partner';
    default:
      return 'Appointments Pro';
  }
}
