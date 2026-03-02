'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { BookingFlow } from '@/components/booking/BookingFlow';
import type { VenuePublic } from '@/components/booking/types';

const ALLOWED_ORIGINS = [
  typeof window !== 'undefined' ? window.location.origin : '',
  'https://reserveni.com',
  'http://localhost:3000',
];

function sendHeight(height: number) {
  if (typeof window === 'undefined' || !window.parent) return;
  window.parent.postMessage(
    { type: 'reserve-ni-height', height },
    '*'
  );
}

export default function EmbedPage() {
  const params = useParams();
  const slug = params['venue-slug'] as string;
  const [venue, setVenue] = useState<VenuePublic | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) {
      setLoading(false);
      setError('Missing venue');
      return;
    }
    fetch(`/api/booking/venue?slug=${encodeURIComponent(slug)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Not found'))))
      .then(setVenue)
      .catch(() => setError('Venue not found'))
      .finally(() => setLoading(false));
  }, [slug]);

  const onHeightChange = useCallback((height: number) => {
    sendHeight(height);
  }, []);

  useEffect(() => {
    const handler = () => sendHeight(document.documentElement.scrollHeight);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  if (loading) {
    return (
      <main className="min-h-screen bg-white p-6">
        <p className="text-neutral-500">Loading…</p>
      </main>
    );
  }

  if (error || !venue) {
    return (
      <main className="min-h-screen bg-white p-6">
        <p className="text-red-600">{error ?? 'Venue not found'}</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-white">
      <BookingFlow venue={venue} embed onHeightChange={onHeightChange} />
    </main>
  );
}
