'use client';

import { useIsTouchDevice } from './useIsTouchDevice';

/**
 * Returns the correct HTML input attributes and react-hook-form register
 * options for a numeric field based on whether the device is touch/mobile.
 *
 * Desktop: type="number" with valueAsNumber (native spinners preserved).
 * Mobile:  type="text" + inputMode="numeric" with setValueAs (allows clearing).
 */
export function useNumericField() {
  const isTouch = useIsTouchDevice();

  function integerProps() {
    if (isTouch) {
      return {
        inputProps: {
          type: 'text' as const,
          inputMode: 'numeric' as const,
          pattern: '[0-9]*',
        },
        registerOptions: {
          setValueAs: (v: string) => (v === '' ? NaN : parseInt(v, 10)),
        },
      };
    }
    return {
      inputProps: { type: 'number' as const },
      registerOptions: { valueAsNumber: true as const },
    };
  }

  function floatProps() {
    if (isTouch) {
      return {
        inputProps: {
          type: 'text' as const,
          inputMode: 'decimal' as const,
          pattern: '[0-9.]*',
        },
        registerOptions: {
          setValueAs: (v: string) => (v === '' ? NaN : parseFloat(v)),
        },
      };
    }
    return {
      inputProps: { type: 'number' as const },
      registerOptions: { valueAsNumber: true as const },
    };
  }

  return { integerProps, floatProps };
}
