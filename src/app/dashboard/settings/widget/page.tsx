import { createClient } from '@/lib/supabase/server';
import { normalizePublicBaseUrl } from '@/lib/public-base-url';
import { redirect } from 'next/navigation';
import { WidgetSection } from './WidgetSection';
import { getDashboardStaff } from '@/lib/venue-auth';

export default async function WidgetPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?redirectTo=/dashboard/settings/widget');

  const staff = await getDashboardStaff(supabase);
  if (staff.role !== 'admin') {
    redirect('/dashboard');
  }

  const venueId = staff.venue_id;

  if (!venueId) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <p className="text-slate-500">No venue linked to your account.</p>
        </div>
      </div>
    );
  }

  const { data: venue } = await staff.db
    .from('venues')
    .select('id, name, slug')
    .eq('id', venueId)
    .single();

  if (!venue) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <p className="text-slate-500">Venue not found.</p>
        </div>
      </div>
    );
  }

  const baseUrl = normalizePublicBaseUrl(process.env.NEXT_PUBLIC_BASE_URL);

  return (
    <div className="p-4 md:p-6 lg:p-8">
      <div className="mx-auto max-w-2xl">
        <h1 className="mb-6 text-2xl font-semibold text-slate-900">Booking Widget & QR Code</h1>
        <WidgetSection venueName={venue.name} venueSlug={venue.slug} baseUrl={baseUrl} />
      </div>
    </div>
  );
}
