import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getDashboardStaff } from '@/lib/venue-auth';
import { ImportHub } from './ImportHub';

export default async function DataImportPage() {
  const supabase = await createClient();
  const staff = await getDashboardStaff(supabase);
  if (!staff?.venue_id) {
    redirect('/dashboard');
  }
  if (staff.role !== 'admin') {
    redirect('/dashboard');
  }

  return (
    <div className="p-4 md:p-6 lg:p-8">
      <div className="mx-auto max-w-3xl">
        <ImportHub />
      </div>
    </div>
  );
}
