/** Appointments plan: flat monthly price (GBP). */
export const APPOINTMENTS_PRICE = 29;

/** Restaurant plan: flat monthly price (GBP). */
export const RESTAURANT_PRICE = 79;

/** Guest SMS after included monthly allowance (Stripe metered usage), per message. */
export const SMS_OVERAGE_GBP_PER_MESSAGE = 0.06;

/** Founding Partner programme cap (restaurants). */
export const FOUNDING_PARTNER_CAP = 20;

/** @deprecated Use APPOINTMENTS_PRICE. Kept for compilation compatibility during migration. */
export const STANDARD_PRICE_PER_CALENDAR = APPOINTMENTS_PRICE;
/** @deprecated Use RESTAURANT_PRICE. Kept for compilation compatibility during migration. */
export const BUSINESS_PRICE = RESTAURANT_PRICE;
