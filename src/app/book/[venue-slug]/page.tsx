import { notFound } from 'next/navigation';
import { getSupabaseAdminClient } from '@/lib/supabase';
import { BookingFlow } from '@/components/booking/BookingFlow';
import type { VenuePublic } from '@/components/booking/types';

async function getVenue(slug: string): Promise<VenuePublic | null> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('venues')
    .select('id, name, slug, cover_photo_url, address, phone, deposit_config, booking_rules, timezone')
    .eq('slug', slug)
    .single();
  if (error || !data) return null;
  return data as VenuePublic;
}

const CANCELLATION_POLICY = 'Full refund if cancelled 48+ hours before your reservation. No refund within 48 hours or for no-shows.';

export default async function BookPage({ params }: { params: Promise<{ 'venue-slug': string }> }) {
  const { 'venue-slug': slug } = await params;
  const venue = await getVenue(slug);
  if (!venue) notFound();

  return (
    <main className="min-h-screen bg-slate-50">
      {/* Venue header */}
      <header className="relative overflow-hidden bg-slate-900">
        {venue.cover_photo_url ? (
          <>
            <img src={venue.cover_photo_url} alt="" className="h-56 w-full object-cover opacity-60 sm:h-64" />
            <div className="absolute inset-0 bg-gradient-to-t from-slate-900/90 via-slate-900/50 to-transparent" />
          </>
        ) : (
          <div className="h-32 bg-gradient-to-br from-brand-700 to-brand-900" />
        )}
        <div className="absolute inset-x-0 bottom-0 px-4 pb-6">
          <div className="mx-auto max-w-lg">
            <h1 className="text-2xl font-bold text-white sm:text-3xl">{venue.name}</h1>
            {(venue.address || venue.phone) && (
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-white/70">
                {venue.address && (
                  <span className="flex items-center gap-1.5">
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" />
                    </svg>
                    {venue.address}
                  </span>
                )}
                {venue.phone && (
                  <a href={`tel:${venue.phone}`} className="flex items-center gap-1.5 hover:text-white">
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 0 0 2.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 0 1-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 0 0-1.091-.852H4.5A2.25 2.25 0 0 0 2.25 4.5v2.25Z" />
                    </svg>
                    {venue.phone}
                  </a>
                )}
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Booking flow */}
      <div className="mx-auto max-w-lg px-4 py-8 pb-24">
        <BookingFlow venue={venue} cancellationPolicy={CANCELLATION_POLICY} />
      </div>

      {/* Footer */}
      <footer className="fixed bottom-0 left-0 right-0 border-t border-slate-200 bg-white/90 backdrop-blur py-3 text-center text-xs text-slate-400">
        <span>
          <a href="/privacy" target="_blank" rel="noopener noreferrer" className="hover:text-brand-600">Privacy</a>
          {' · '}
          <a href="/terms" target="_blank" rel="noopener noreferrer" className="hover:text-brand-600">Terms</a>
          {' · '}
          <a href="https://reserveni.com" target="_blank" rel="noopener noreferrer" className="hover:text-brand-600">
            Powered by Reserve NI
          </a>
        </span>
      </footer>
    </main>
  );
}
