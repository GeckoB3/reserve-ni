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
    <main className="min-h-screen bg-white">
      {venue.cover_photo_url && (
        <header className="relative h-48 w-full overflow-hidden bg-neutral-200 sm:h-56">
          <img src={venue.cover_photo_url} alt="" className="h-full w-full object-cover" />
        </header>
      )}
      <div className="mx-auto max-w-lg px-4 pb-24 pt-4">
        <h1 className="text-xl font-semibold text-neutral-900 sm:text-2xl">{venue.name}</h1>
        {(venue.address || venue.phone) && (
          <div className="mt-2 space-y-0.5 text-sm text-neutral-600">
            {venue.address && <p>{venue.address}</p>}
            {venue.phone && <p><a href={`tel:${venue.phone}`} className="underline">{venue.phone}</a></p>}
          </div>
        )}
        <BookingFlow venue={venue} cancellationPolicy={CANCELLATION_POLICY} />
      </div>
      <footer className="fixed bottom-0 left-0 right-0 border-t border-neutral-200 bg-white py-3 text-center text-xs text-neutral-500">
        <a href="https://reserveni.com" target="_blank" rel="noopener noreferrer" className="underline">
          Powered by Reserve NI
        </a>
      </footer>
    </main>
  );
}
