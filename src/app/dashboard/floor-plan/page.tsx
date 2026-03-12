import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { getDashboardStaff } from '@/lib/venue-auth';
import { UnifiedFloorPlanView } from './UnifiedFloorPlanView';

export default async function FloorPlanPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?redirectTo=/dashboard/floor-plan');

  const staff = await getDashboardStaff(supabase);
  if (!staff.venue_id) redirect('/dashboard');

  const { data: venue } = await staff.db
    .from('venues')
    .select('table_management_enabled')
    .eq('id', staff.venue_id)
    .single();

  if (!venue?.table_management_enabled) redirect('/dashboard/day-sheet');

  return (
    <div className="p-2 md:p-4 lg:p-6">
      <UnifiedFloorPlanView isAdmin={staff.role === 'admin'} venueId={staff.venue_id} />
    </div>
  );
}
