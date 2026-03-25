import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { getDashboardStaff } from '@/lib/venue-auth';
import AvailabilitySettingsClient from './AvailabilitySettingsClient';

export default async function AvailabilitySettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?redirectTo=/dashboard/availability');

  const staff = await getDashboardStaff(supabase);
  if (staff.role !== 'admin') {
    redirect('/dashboard');
  }

  return <AvailabilitySettingsClient />;
}
