import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { ReportsView } from './ReportsView';
import { getDashboardStaff } from '@/lib/venue-auth';

export default async function ReportsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?redirectTo=/dashboard/reports');

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
      <div className="mx-auto max-w-5xl">
        <h1 className="mb-6 text-2xl font-semibold text-slate-900">Reports</h1>
        <ReportsView />
      </div>
    </div>
  );
}
