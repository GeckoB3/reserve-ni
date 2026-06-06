import { notFound, redirect } from 'next/navigation';
import { getPublicVenueForBookBySlug } from '@/lib/booking/get-public-venue-for-book';
import { BookPublicLayout } from '@/components/booking/BookPublicLayout';
import { loadBookPublicLayoutData } from '@/lib/booking/load-book-public-layout-data';
import { getSupabaseAdminClient } from '@/lib/supabase';
import { resolveCombinedSlugClaim } from '@/lib/linked-accounts/catalogue';
import { loadCollectivePageView, CollectivePageBody } from '../c/[slug]/collective-page-view';

export default async function BookPage({ params }: { params: Promise<{ 'venue-slug': string }> }) {
  const { 'venue-slug': slug } = await params;
  const admin = getSupabaseAdminClient();

  // Combined booking page (plan §5.2): a live combined collective may adopt this
  // venue's slug, or this venue may redirect its solo page to one. The claim
  // returns null once the combined page is gone, so routing heals automatically.
  const claim = await resolveCombinedSlugClaim(admin, slug);
  if (claim?.kind === 'redirect' && claim.redirectTo) {
    redirect(claim.redirectTo); // 307 (temporary) so it reverts cleanly on dissolve
  }
  if (claim?.kind === 'adopt') {
    const view = await loadCollectivePageView(admin, claim.collectiveSlug);
    if (view.status === 'live') return <CollectivePageBody view={view} />;
    // Combined page not currently live → fall through to the venue's own page so
    // the slug-donor is never stranded on a dead "unavailable" screen (plan §8.3).
  }

  const venue = await getPublicVenueForBookBySlug(slug);
  if (!venue) notFound();

  const { services, team } = await loadBookPublicLayoutData(getSupabaseAdminClient(), venue);

  return <BookPublicLayout venue={venue} team={team} services={services} />;
}
