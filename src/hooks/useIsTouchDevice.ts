'use client';

import { useEffect, useState } from 'react';

/**
 * Detects whether the current device has a touch-primary input.
 * Returns false during SSR and on the first render (safe for hydration),
 * then flips to true on touch devices after mount.
 */
export function useIsTouchDevice(): boolean {
  const [isTouch, setIsTouch] = useState(false);

  useEffect(() => {
    const touch = window.matchMedia('(pointer: coarse)').matches;
    setIsTouch(touch);
  }, []);

  return isTouch;
}
