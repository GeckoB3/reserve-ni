import { notFound } from 'next/navigation';
import { getSupabaseAdminClient } from '@/lib/supabase';
import { BookingFlow } from '@/components/booking/BookingFlow';
import type { VenuePublic } from '@/components/booking/types';

async function getVenue(slug: string): Promise<VenuePublic | null> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('venues')
    .select('id, name, slug, cover_photo_url, deposit_config, booking_rules, timezone')
    .eq('slug', slug)
    .single();
  if (error || !data) return null;
  return data as VenuePublic;
}

export default async function BookPage({ params }: { params: Promise<{ 'venue-slug': string }> }) {
  const { 'venue-slug': slug } = await params;
  const venue = await getVenue(slug);
  if (!venue) notFound();

  return (
    <main className="min-h-screen bg-white">
      <BookingFlow venue={venue} />
    </main>
  );
}
