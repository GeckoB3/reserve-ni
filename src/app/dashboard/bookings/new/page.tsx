import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { PhoneBookingForm } from './PhoneBookingForm';
import { getDashboardStaff } from '@/lib/venue-auth';

export default async function NewBookingPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    redirect('/login?redirectTo=/dashboard/bookings/new');
  }

  const staff = await getDashboardStaff(supabase);
  const venueId = staff.venue_id;
  if (!venueId) {
    return (
      <main className="min-h-screen p-6">
        <p className="text-neutral-600">No venue linked.</p>
        <Link href="/dashboard" className="mt-4 inline-block text-blue-600 underline">Dashboard</Link>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-neutral-50 p-6">
      <div className="mx-auto max-w-lg">
        <div className="mb-6 flex items-center gap-4">
          <Link href="/dashboard" className="text-neutral-600 underline hover:text-neutral-900">Dashboard</Link>
          <span className="text-neutral-400">/</span>
          <Link href="/dashboard/bookings" className="text-neutral-600 underline hover:text-neutral-900">Bookings</Link>
          <span className="text-neutral-400">/</span>
          <h1 className="text-xl font-semibold">New phone booking</h1>
        </div>
        <PhoneBookingForm venueId={venueId} />
      </div>
    </main>
  );
}
