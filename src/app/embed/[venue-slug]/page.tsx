import { notFound } from 'next/navigation';
import { getPublicVenueForBookBySlug } from '@/lib/booking/get-public-venue-for-book';
import { EmbedBookingClient } from './EmbedBookingClient';

export default async function EmbedPage({
  params,
  searchParams,
}: {
  params: Promise<{ 'venue-slug': string }>;
  searchParams: Promise<{ accent?: string }>;
}) {
  const { 'venue-slug': slug } = await params;
  const { accent } = await searchParams;
  if (!slug || typeof slug !== 'string') notFound();

  const venue = await getPublicVenueForBookBySlug(slug);
  if (!venue) notFound();

  return <EmbedBookingClient venue={venue} accentColour={typeof accent === 'string' ? accent : null} />;
}
