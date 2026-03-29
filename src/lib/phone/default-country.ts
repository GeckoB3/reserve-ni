import type { CountryCode } from 'libphonenumber-js';

/**
 * Default ITU region for phone inputs on booking flows, from venue billing currency.
 * GBP → GB (+44); EUR → IE (+353). Unknown / missing → GB (+44).
 */
export function defaultPhoneCountryForVenueCurrency(currency?: string | null): CountryCode {
  const c = (currency ?? 'GBP').toUpperCase();
  if (c === 'EUR') return 'IE';
  return 'GB';
}
