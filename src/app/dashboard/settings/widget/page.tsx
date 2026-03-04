import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { WidgetSection } from './WidgetSection';
import { getDashboardStaff } from '@/lib/venue-auth';

export default async function WidgetPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    redirect('/login?redirectTo=/dashboard/settings/widget');
  }

  const staff = await getDashboardStaff(supabase);
  const venueId = staff.venue_id;
  if (!venueId) {
    return (
      <main className="min-h-screen p-6">
        <p className="text-neutral-600">No venue linked.</p>
        <Link href="/dashboard" className="mt-4 inline-block text-blue-600 underline">Dashboard</Link>
      </main>
    );
  }

  const { data: venue } = await staff.db
    .from('venues')
    .select('id, name, slug')
    .eq('id', venueId)
    .single();

  if (!venue) {
    return (
      <main className="min-h-screen p-6">
        <p className="text-neutral-600">Venue not found.</p>
        <Link href="/dashboard" className="mt-4 inline-block text-blue-600 underline">Dashboard</Link>
      </main>
    );
  }

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://reserveni.com';

  return (
    <main className="min-h-screen bg-neutral-50 p-6">
      <div className="mx-auto max-w-2xl">
        <div className="mb-6 flex items-center gap-4">
          <Link href="/dashboard/settings" className="text-neutral-600 underline hover:text-neutral-900">Venue settings</Link>
          <span className="text-neutral-400">/</span>
          <h1 className="text-2xl font-semibold text-neutral-900">Booking widget & QR code</h1>
        </div>
        <WidgetSection venueName={venue.name} venueSlug={venue.slug} baseUrl={baseUrl} />
      </div>
    </main>
  );
}
