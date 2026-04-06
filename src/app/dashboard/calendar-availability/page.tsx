import { Suspense } from 'react';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { getDashboardStaff } from '@/lib/venue-auth';
import { getSupabaseAdminClient } from '@/lib/supabase';
import { AppointmentAvailabilitySettings } from '@/app/dashboard/availability/AppointmentAvailabilitySettings';
import type { BookingModel } from '@/types/booking-models';
import { normalizeEnabledModels } from '@/lib/booking/enabled-models';
import { shouldShowAppointmentAvailabilitySettings } from '@/lib/booking/schedule-calendar-eligibility';

export default async function CalendarAvailabilitySettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?redirectTo=/dashboard/calendar-availability');

  const staff = await getDashboardStaff(supabase);
  if (!staff.venue_id) {
    redirect('/dashboard');
  }

  const admin = getSupabaseAdminClient();
  const { data: venue } = await admin
    .from('venues')
    .select('booking_model, enabled_models')
    .eq('id', staff.venue_id)
    .single();
  const bookingModel = (venue?.booking_model as BookingModel) ?? 'table_reservation';
  const enabledModels = normalizeEnabledModels(
    (venue as { enabled_models?: unknown } | null)?.enabled_models,
    bookingModel,
  );

  if (!shouldShowAppointmentAvailabilitySettings(bookingModel, enabledModels)) {
    redirect('/dashboard');
  }

  const isAdmin = staff.role === 'admin';

  return (
    <div className="p-4 md:p-6 lg:p-8">
      <div className="mx-auto max-w-4xl">
        <Suspense
          fallback={
            <div className="flex items-center justify-center py-12">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
            </div>
          }
        >
          <AppointmentAvailabilitySettings isAdmin={isAdmin} currentStaffId={staff.id} />
        </Suspense>
      </div>
    </div>
  );
}
