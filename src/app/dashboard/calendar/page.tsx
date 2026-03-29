import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { getDashboardStaff, getLinkedPractitionerId } from '@/lib/venue-auth';
import { getSupabaseAdminClient } from '@/lib/supabase';
import { ToastProvider } from '@/components/ui/Toast';
import { PractitionerCalendarView } from '../practitioner-calendar/PractitionerCalendarView';

export default async function CalendarPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?redirectTo=/dashboard/calendar');

  const staff = await getDashboardStaff(supabase);
  if (!staff.venue_id) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center p-12">
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <p className="text-slate-500">No venue linked to your account.</p>
        </div>
      </div>
    );
  }

  const admin = getSupabaseAdminClient();
  const { data: venue } = await admin.from('venues').select('currency, booking_model').eq('id', staff.venue_id).single();
  if (venue?.booking_model !== 'practitioner_appointment') {
    redirect('/dashboard');
  }

  const currency = (venue?.currency as string) ?? 'GBP';

  const linkedPractitionerId =
    staff.role === 'staff' && staff.id
      ? await getLinkedPractitionerId(admin, staff.venue_id, staff.id)
      : null;
  const defaultPractitionerFilter: 'all' | string = linkedPractitionerId ?? 'all';

  return (
    <ToastProvider>
      <div className="p-4 md:p-6 lg:p-8">
        <div className="mx-auto max-w-[1600px]">
          <PractitionerCalendarView
            venueId={staff.venue_id}
            currency={currency}
            defaultPractitionerFilter={defaultPractitionerFilter}
            linkedPractitionerId={linkedPractitionerId}
          />
        </div>
      </div>
    </ToastProvider>
  );
}
