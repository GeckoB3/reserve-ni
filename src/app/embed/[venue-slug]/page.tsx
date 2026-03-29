'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { BookingFlowRouter } from '@/components/booking/BookingFlowRouter';
import type { VenuePublic } from '@/components/booking/types';
import { displayLabelForWebsiteUrl } from '@/lib/urls/website-url';

let lastSentHeight = 0;
function sendHeight(height: number) {
  if (typeof window === 'undefined' || !window.parent) return;
  if (height === lastSentHeight) return;
  lastSentHeight = height;
  window.parent.postMessage({ type: 'reserve-ni-height', height }, '*');
}

export default function EmbedPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const slug = params['venue-slug'] as string;
  const accentColour = searchParams.get('accent') ?? null;
  const [venue, setVenue] = useState<VenuePublic | null>(null);
  const [fetchState, setFetchState] = useState<'idle' | 'loading' | 'done'>('idle');
  const [error, setError] = useState<string | null>(null);
  const contentRef = useRef<HTMLElement>(null);
  const slugError = !slug ? 'Missing venue' : null;
  const showLoading = Boolean(slug) && fetchState !== 'done';

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    const id = requestAnimationFrame(() => {
      if (cancelled) return;
      setFetchState('loading');
      fetch(`/api/booking/venue?slug=${encodeURIComponent(slug)}`)
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Not found'))))
        .then(setVenue)
        .catch(() => setError('Venue not found'))
        .finally(() => {
          if (!cancelled) setFetchState('done');
        });
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(id);
    };
  }, [slug]);

  const onHeightChange = useCallback(() => {
    sendHeight(document.documentElement.scrollHeight);
  }, []);

  // ResizeObserver — catches every layout change automatically
  useEffect(() => {
    const el = contentRef.current ?? document.body;
    const observer = new ResizeObserver(() => {
      sendHeight(document.documentElement.scrollHeight);
    });
    observer.observe(el);
    sendHeight(document.documentElement.scrollHeight);
    return () => observer.disconnect();
  }, []);

  if (showLoading) {
    return (
      <main ref={contentRef} className="bg-white p-6">
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
        </div>
      </main>
    );
  }

  const displayError = slugError ?? error;
  if (displayError || !venue) {
    return (
      <main ref={contentRef} className="bg-white p-6">
        <p className="text-sm text-red-600">{displayError ?? 'Venue not found'}</p>
      </main>
    );
  }

  const accentStyle = accentColour ? { '--accent': `#${accentColour.replace(/^#/, '')}` } as React.CSSProperties : undefined;

  return (
    <main ref={contentRef} className="bg-white p-4" style={accentStyle}>
      {venue.website_url ? (
        <p className="mb-3 text-center">
          <a
            href={venue.website_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-semibold text-brand-600 underline decoration-brand-600/30 underline-offset-2 hover:text-brand-800"
          >
            Visit {displayLabelForWebsiteUrl(venue.website_url)}
          </a>
        </p>
      ) : null}
      <BookingFlowRouter venue={venue} embed onHeightChange={onHeightChange} accentColour={accentColour ?? undefined} cancellationPolicy="Full refund if cancelled 48+ hours before your reservation. No refund within 48 hours or for no-shows." />
    </main>
  );
}
