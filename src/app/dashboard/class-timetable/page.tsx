import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { getDashboardStaff, getStaffManagedCalendarIds } from '@/lib/venue-auth';
import { getSupabaseAdminClient } from '@/lib/supabase';
import { ToastProvider } from '@/components/ui/Toast';
import { ClassTimetableView } from './ClassTimetableView';

export default async function ClassTimetablePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?redirectTo=/dashboard/class-timetable');

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
    .select('currency, stripe_connected_account_id')
    .eq('id', staff.venue_id)
    .single();
  const currency = (venue?.currency as string) ?? 'GBP';
  const stripeConnected = Boolean((venue as { stripe_connected_account_id?: string | null } | null)?.stripe_connected_account_id);
  const linkedPractitionerIds =
    staff.role === 'admin' || !staff.id
      ? []
      : await getStaffManagedCalendarIds(admin, staff.venue_id, staff.id);

  return (
    <ToastProvider>
      <div className="p-4 md:p-6 lg:p-8">
        <div className="mx-auto max-w-6xl">
          <ClassTimetableView
            venueId={staff.venue_id}
            isAdmin={staff.role === 'admin'}
            linkedPractitionerIds={linkedPractitionerIds}
            currency={currency}
            stripeConnected={stripeConnected}
          />
        </div>
      </div>
    </ToastProvider>
  );
}
