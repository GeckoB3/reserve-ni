import { notFound } from 'next/navigation';
import { getPublicVenueForBookBySlug } from '@/lib/booking/get-public-venue-for-book';
import { BookPublicLayout } from '@/components/booking/BookPublicLayout';

export default async function BookPage({ params }: { params: Promise<{ 'venue-slug': string }> }) {
  const { 'venue-slug': slug } = await params;
  const venue = await getPublicVenueForBookBySlug(slug);
  if (!venue) notFound();

  return <BookPublicLayout venue={venue} />;
}
