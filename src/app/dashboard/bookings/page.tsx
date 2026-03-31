import { Suspense } from 'react';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { BookingsDashboard } from './BookingsDashboard';
import { AppointmentBookingsDashboard } from './AppointmentBookingsDashboard';
import { getDashboardStaff, getLinkedPractitionerId } from '@/lib/venue-auth';
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

  const linkedPractitionerId =
    isAppointment && staff.role === 'staff' && staff.id
      ? await getLinkedPractitionerId(admin, venueId, staff.id)
      : null;
  const defaultAppointmentPractitionerFilter: 'all' | string = linkedPractitionerId ?? 'all';

  return (
    <div className="min-h-0 min-w-0 px-3 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] sm:px-4 md:p-6 md:pb-8 md:pt-6 lg:p-8">
      <div className="mx-auto max-w-6xl min-w-0">
        <h1 className="mb-4 text-xl font-semibold tracking-tight text-slate-900 sm:mb-6 sm:text-2xl">{title}</h1>
        <ToastProvider>
          <Suspense fallback={<div className="rounded-lg border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">Loading bookings…</div>}>
            {isAppointment ? (
              <AppointmentBookingsDashboard
                venueId={venueId}
                currency={currency}
                defaultPractitionerFilter={defaultAppointmentPractitionerFilter}
                linkedPractitionerId={linkedPractitionerId}
              />
            ) : (
              <BookingsDashboard venueId={venueId} currency={currency} />
            )}
          </Suspense>
        </ToastProvider>
      </div>
    </div>
  );
}
