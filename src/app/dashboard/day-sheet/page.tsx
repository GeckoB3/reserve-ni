import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { DaySheetView } from './DaySheetView';
import { SwRegister } from './sw-register';
import { getDashboardStaff } from '@/lib/venue-auth';
import { getSupabaseAdminClient } from '@/lib/supabase';
import { ToastProvider } from '@/components/ui/Toast';
import type { BookingModel } from '@/types/booking-models';
import { isUnifiedSchedulingVenue } from '@/lib/booking/unified-scheduling';

export default async function DaySheetPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?redirectTo=/dashboard/day-sheet');

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

  const admin = getSupabaseAdminClient();
  const { data: venue } = await admin
    .from('venues')
    .select('table_management_enabled, booking_model, currency')
    .eq('id', venueId)
    .single();

  if (venue?.table_management_enabled) {
    redirect('/dashboard/floor-plan');
  }

  const bookingModel = (venue?.booking_model as BookingModel) ?? 'table_reservation';

  if (isUnifiedSchedulingVenue(bookingModel)) {
    redirect('/dashboard/calendar');
  }

  return (
    <div className="p-3 md:p-6 lg:p-8">
      <div className="mx-auto max-w-5xl">
        <SwRegister />
        <ToastProvider>
          <DaySheetView venueId={venueId} currency={(venue?.currency as string) ?? 'GBP'} />
        </ToastProvider>
      </div>
    </div>
  );
}
