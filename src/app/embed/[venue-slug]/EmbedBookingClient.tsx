'use client';

import { useCallback, useEffect, useRef } from 'react';
import { BookPublicBookingFlow } from '@/components/booking/BookPublicBookingFlow';
import type { VenuePublic } from '@/components/booking/types';

let lastSentHeight = 0;
function sendHeight(height: number) {
  if (typeof window === 'undefined' || !window.parent) return;
  if (height === lastSentHeight) return;
  lastSentHeight = height;
  window.parent.postMessage({ type: 'reserve-ni-height', height }, '*');
}

export function EmbedBookingClient({
  venue,
  accentColour,
}: {
  venue: VenuePublic;
  accentColour: string | null;
}) {
  const contentRef = useRef<HTMLElement>(null);

  const onHeightChange = useCallback(() => {
    sendHeight(document.documentElement.scrollHeight);
  }, []);

  useEffect(() => {
    const el = contentRef.current ?? document.body;
    const observer = new ResizeObserver(() => {
      sendHeight(document.documentElement.scrollHeight);
    });
    observer.observe(el);
    sendHeight(document.documentElement.scrollHeight);
    return () => observer.disconnect();
  }, []);

  const accentStyle = accentColour
    ? ({ '--accent': `#${accentColour.replace(/^#/, '')}` } as React.CSSProperties)
    : undefined;

  return (
    <main ref={contentRef} className="bg-white p-4" style={accentStyle}>
      <BookPublicBookingFlow
        venue={venue}
        embed
        onHeightChange={onHeightChange}
        accentColour={accentColour ?? undefined}
      />
    </main>
  );
}
