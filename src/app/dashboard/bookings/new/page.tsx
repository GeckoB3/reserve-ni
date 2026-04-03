import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { getDashboardStaff } from '@/lib/venue-auth';
import { normalizeEnabledModels } from '@/lib/booking/enabled-models';
import type { BookingModel } from '@/types/booking-models';
import { NewBookingPageClient } from './NewBookingPageClient';

export default async function NewBookingPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?redirectTo=/dashboard/bookings/new');

  const staff = await getDashboardStaff(supabase);
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
    .select('table_management_enabled, booking_model, currency, enabled_models')
    .eq('id', venueId)
    .single();

  const advancedMode = Boolean(venue?.table_management_enabled);
  const bookingModel = ((venue?.booking_model as string) ?? 'table_reservation') as BookingModel;
  const currency = (venue?.currency as string) ?? 'GBP';
  const enabledModels = normalizeEnabledModels(venue?.enabled_models, bookingModel);

  return (
    <NewBookingPageClient
      venueId={venueId}
      advancedMode={advancedMode}
      bookingModel={bookingModel}
      currency={currency}
      enabledModels={enabledModels}
    />
  );
}
