import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { ReportsView } from './ReportsView';
import { getDashboardStaff } from '@/lib/venue-auth';
import type { BookingModel, VenueTerminology } from '@/types/booking-models';
import { DEFAULT_TERMINOLOGY } from '@/types/booking-models';

function mergeVenueTerminology(model: BookingModel, raw: unknown): VenueTerminology {
  const base = DEFAULT_TERMINOLOGY[model];
  if (!raw || typeof raw !== 'object') return base;
  const t = raw as Partial<VenueTerminology>;
  return {
    client: typeof t.client === 'string' ? t.client : base.client,
    booking: typeof t.booking === 'string' ? t.booking : base.booking,
    staff: typeof t.staff === 'string' ? t.staff : base.staff,
  };
}

export default async function ReportsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?redirectTo=/dashboard/reports');

  const staff = await getDashboardStaff(supabase);
  if (staff.role !== 'admin') {
    redirect('/dashboard');
  }

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

  const { data: venueRow, error: venueRowError } = await staff.db
    .from('venues')
    .select('booking_model, terminology')
    .eq('id', venueId)
    .single();

  if (venueRowError) {
    console.error('[reports page] venue booking_model load failed:', venueRowError.message);
  }

  const bookingModel = (venueRow?.booking_model as BookingModel | null) ?? 'table_reservation';
  const terminology = mergeVenueTerminology(bookingModel, venueRow?.terminology);

  return (
    <div className="p-4 md:p-6 lg:p-8">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-slate-900">Reports</h1>
          {bookingModel === 'practitioner_appointment' ? (
            <p className="mt-1 text-sm text-slate-500">
              Appointment analytics for your team, services, and channels. Figures use the selected date range
              unless noted.
            </p>
          ) : (
            <p className="mt-1 text-sm text-slate-500">
              Covers, deposits, and guest trends for your venue. Figures use the selected date range unless
              noted.
            </p>
          )}
        </div>
        <ReportsView bookingModel={bookingModel} terminology={terminology} />
      </div>
    </div>
  );
}
