import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { BookingsDashboard } from './BookingsDashboard';
import { getDashboardStaff } from '@/lib/venue-auth';
import { getSupabaseAdminClient } from '@/lib/supabase';
import { ToastProvider } from '@/components/ui/Toast';
import type { BookingModel } from '@/types/booking-models';

export default async function BookingsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?redirectTo=/dashboard/bookings');

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
  const { data: venue } = await admin.from('venues').select('booking_model, currency').eq('id', venueId).single();
  const bookingModel = (venue?.booking_model as BookingModel) ?? 'table_reservation';
  const currency = (venue?.currency as string) ?? 'GBP';
  const isAppointment = bookingModel === 'practitioner_appointment';
  const title = isAppointment ? 'Appointments' : 'Reservations';

  return (
    <div className="p-4 md:p-6 lg:p-8">
      <div className="mx-auto max-w-6xl">
        <h1 className="mb-6 text-2xl font-semibold text-slate-900">{title}</h1>
        <ToastProvider>
          <BookingsDashboard venueId={venueId} bookingModel={bookingModel} currency={currency} />
        </ToastProvider>
      </div>
    </div>
  );
}
