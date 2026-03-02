import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { BookingsDashboard } from './BookingsDashboard';

export default async function BookingsPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) {
    redirect('/login?redirectTo=/dashboard/bookings');
  }

  const email = (data.claims as { email?: string }).email ?? '';
  const { data: staffRows } = await supabase.from('staff').select('venue_id').eq('email', email);
  const venueId = staffRows?.[0]?.venue_id;

  if (!venueId) {
    return (
      <main className="min-h-screen p-6">
        <p className="text-neutral-600">No venue linked.</p>
        <Link href="/dashboard" className="mt-4 inline-block text-blue-600 underline">Dashboard</Link>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-neutral-50 p-4 md:p-6">
      <div className="mx-auto max-w-6xl">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <Link href="/dashboard" className="text-neutral-600 underline hover:text-neutral-900">Dashboard</Link>
          <span className="text-neutral-400">/</span>
          <h1 className="text-xl font-semibold text-neutral-900 md:text-2xl">Reservations</h1>
        </div>
        <BookingsDashboard venueId={venueId} />
      </div>
    </main>
  );
}
