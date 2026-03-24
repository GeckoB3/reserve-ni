'use client';

import { useEffect, useState } from 'react';
import { getCountries, type CountryCode } from 'libphonenumber-js';

const VALID = new Set<string>(getCountries());

/**
 * Browser locale region when supported by libphonenumber metadata; otherwise GB.
 */
export function useDefaultPhoneCountry(): CountryCode {
  const [country, setCountry] = useState<CountryCode>('GB');

  useEffect(() => {
    try {
      const region = new Intl.Locale(navigator.language).maximize().region;
      if (region && VALID.has(region)) {
        setCountry(region as CountryCode);
      }
    } catch {
      /* ignore */
    }
  }, []);

  return country;
}
