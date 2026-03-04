import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { PhoneBookingForm } from './PhoneBookingForm';
import { getDashboardStaff } from '@/lib/venue-auth';

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

  return (
    <div className="p-4 md:p-6 lg:p-8">
      <div className="mx-auto max-w-lg">
        <h1 className="mb-6 text-2xl font-semibold text-slate-900">New Booking</h1>
        <PhoneBookingForm venueId={venueId} />
      </div>
    </div>
  );
}
