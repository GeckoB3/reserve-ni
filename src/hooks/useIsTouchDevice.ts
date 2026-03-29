'use client';

import { useSyncExternalStore } from 'react';

function subscribeTouchPreference(onStoreChange: () => void) {
  const mq = window.matchMedia('(pointer: coarse)');
  mq.addEventListener('change', onStoreChange);
  return () => mq.removeEventListener('change', onStoreChange);
}

function getTouchSnapshot() {
  return window.matchMedia('(pointer: coarse)').matches;
}

/**
 * Detects whether the current device has a touch-primary input.
 * Returns false during SSR (server snapshot); updates when the coarse-pointer media query changes.
 */
export function useIsTouchDevice(): boolean {
  return useSyncExternalStore(subscribeTouchPreference, getTouchSnapshot, () => false);
}
