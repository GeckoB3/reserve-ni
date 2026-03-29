'use client';

import { useSyncExternalStore } from 'react';
import { getCountries, type CountryCode } from 'libphonenumber-js';

const VALID = new Set<string>(getCountries());

function readLocaleCountry(): CountryCode {
  try {
    const region = new Intl.Locale(navigator.language).maximize().region;
    if (region && VALID.has(region)) return region as CountryCode;
  } catch {
    /* ignore */
  }
  return 'GB';
}

/**
 * Browser locale region when supported by libphonenumber metadata; otherwise GB.
 */
export function useDefaultPhoneCountry(): CountryCode {
  return useSyncExternalStore(
    () => () => {},
    readLocaleCountry,
    () => 'GB',
  );
}
