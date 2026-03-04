import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ReportsView } from './ReportsView';
import { getDashboardStaff } from '@/lib/venue-auth';

export default async function ReportsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    redirect('/login?redirectTo=/dashboard/reports');
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
    <main className="min-h-screen bg-neutral-50 p-4 md:p-6">
      <div className="mx-auto max-w-5xl">
        <div className="mb-4 flex items-center gap-2">
          <Link href="/dashboard" className="text-neutral-600 underline hover:text-neutral-900 text-sm">Dashboard</Link>
          <span className="text-neutral-400">/</span>
          <h1 className="text-xl font-semibold text-neutral-900">Reports</h1>
        </div>
        <ReportsView />
      </div>
    </main>
  );
}
