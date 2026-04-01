import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { getDashboardStaff, getLinkedPractitionerId } from '@/lib/venue-auth';
import { getSupabaseAdminClient } from '@/lib/supabase';
import { ToastProvider } from '@/components/ui/Toast';
import { PractitionerCalendarView } from '../practitioner-calendar/PractitionerCalendarView';
import { isUnifiedSchedulingVenue } from '@/lib/booking/unified-scheduling';
import { getSmsUsageDisplayForVenue } from '@/lib/billing/sms-usage-display';

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
  if (!isUnifiedSchedulingVenue(venue?.booking_model)) {
    redirect('/dashboard');
  }

  const currency = (venue?.currency as string) ?? 'GBP';

  const linkedPractitionerId =
    staff.role === 'staff' && staff.id
      ? await getLinkedPractitionerId(admin, staff.venue_id, staff.id)
      : null;
  const defaultPractitionerFilter: 'all' | string = linkedPractitionerId ?? 'all';

  const smsUsage = await getSmsUsageDisplayForVenue(admin, staff.venue_id);

  return (
    <ToastProvider>
      <div className="p-4 md:p-6 lg:p-8">
        <div className="mx-auto max-w-[1600px]">
          {smsUsage && (
            <div className="mb-4 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">SMS this month</p>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <div className="h-2 flex-1 min-w-[100px] max-w-sm overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-brand-500"
                    style={{
                      width: `${Math.min(
                        100,
                        smsUsage.messages_included > 0
                          ? (smsUsage.messages_sent / smsUsage.messages_included) * 100
                          : 0,
                      )}%`,
                    }}
                  />
                </div>
                <p className="text-sm text-slate-700">
                  <span className="font-semibold text-slate-900">{smsUsage.messages_sent}</span>
                  {' / '}
                  {smsUsage.messages_included} used
                  <span className="text-slate-500"> ({smsUsage.remaining} left)</span>
                </p>
              </div>
              {smsUsage.overage_count > 0 && (
                <p className="mt-2 text-xs text-amber-800">
                  {smsUsage.overage_count} over included allowance — ≈ £{(smsUsage.overage_amount_pence / 100).toFixed(2)} at
                  5p each (billed at month end)
                </p>
              )}
            </div>
          )}
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
