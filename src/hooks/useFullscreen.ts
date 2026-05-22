'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  isDocumentFullscreen,
  isFullscreenApiSupported,
  toggleDocumentFullscreen,
} from '@/lib/ui/fullscreen';

const FULLSCREEN_CHANGE_EVENTS = ['fullscreenchange', 'webkitfullscreenchange'] as const;

/**
 * Tracks and toggles browser fullscreen for the dashboard (document element).
 * Listens for vendor-prefixed fullscreen change events where needed.
 */
export function useFullscreen() {
  const [supported, setSupported] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    setSupported(isFullscreenApiSupported());
    setIsFullscreen(isDocumentFullscreen());

    const sync = () => setIsFullscreen(isDocumentFullscreen());
    for (const eventName of FULLSCREEN_CHANGE_EVENTS) {
      document.addEventListener(eventName, sync);
    }
    return () => {
      for (const eventName of FULLSCREEN_CHANGE_EVENTS) {
        document.removeEventListener(eventName, sync);
      }
    };
  }, []);

  const toggle = useCallback(async () => {
    if (!isFullscreenApiSupported()) return;
    try {
      await toggleDocumentFullscreen();
    } catch (err) {
      console.error('[useFullscreen] Failed to toggle fullscreen', err);
    }
  }, []);

  return { isFullscreen, supported, toggle };
}
