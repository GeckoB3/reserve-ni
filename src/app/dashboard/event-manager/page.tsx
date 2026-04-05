import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { getDashboardStaff } from '@/lib/venue-auth';
import { getSupabaseAdminClient } from '@/lib/supabase';
import { normalizePublicBaseUrl } from '@/lib/public-base-url';
import { ToastProvider } from '@/components/ui/Toast';
import { EventManagerView } from './EventManagerView';

export default async function EventManagerPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?redirectTo=/dashboard/event-manager');

  const staff = await getDashboardStaff(supabase);
  if (!staff.venue_id) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <p className="text-slate-500">No venue linked to your account.</p>
        </div>
      </div>
    );
  }

  const admin = getSupabaseAdminClient();
  const { data: venue } = await admin
    .from('venues')
    .select('currency, slug, booking_model')
    .eq('id', staff.venue_id)
    .single();
  const currency = (venue?.currency as string) ?? 'GBP';
  const slug = (venue?.slug as string) ?? '';
  const base = normalizePublicBaseUrl(process.env.NEXT_PUBLIC_BASE_URL);
  const publicBookingUrl = slug ? `${base}/book/${encodeURIComponent(slug)}` : base;

  return (
    <ToastProvider>
      <div className="p-4 md:p-6 lg:p-8">
        <div className="mx-auto max-w-5xl">
          <EventManagerView
            venueId={staff.venue_id}
            isAdmin={staff.role === 'admin'}
            currency={currency}
            publicBookingUrl={publicBookingUrl}
            bookingModel={(venue?.booking_model as string) ?? 'table_reservation'}
          />
        </div>
      </div>
    </ToastProvider>
  );
}
