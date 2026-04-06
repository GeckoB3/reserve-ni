import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { getDashboardStaff } from '@/lib/venue-auth';
import { getSupabaseAdminClient } from '@/lib/supabase';
import AvailabilitySettingsClient from './AvailabilitySettingsClient';
import type { BookingModel } from '@/types/booking-models';
import { normalizeEnabledModels } from '@/lib/booking/enabled-models';
import { shouldShowAppointmentAvailabilitySettings } from '@/lib/booking/schedule-calendar-eligibility';

export default async function AvailabilitySettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?redirectTo=/dashboard/availability');

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

  if (bookingModel !== 'table_reservation') {
    if (shouldShowAppointmentAvailabilitySettings(bookingModel, enabledModels)) {
      redirect('/dashboard/calendar-availability');
    }
    redirect('/dashboard');
  }

  if (staff.role !== 'admin') {
    redirect('/dashboard');
  }

  return <AvailabilitySettingsClient />;
}
