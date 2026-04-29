import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { getDashboardStaff } from '@/lib/venue-auth';
import { PageFrame } from '@/components/ui/dashboard/PageFrame';
import { ClassCommerceProductsClient } from './ClassCommerceProductsClient';

export default async function ClassCommerceProductsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?redirectTo=/dashboard/class-timetable/products');

  const staff = await getDashboardStaff(supabase);
  if (!staff.venue_id) {
    redirect('/dashboard/class-timetable');
  }
  return (
    <PageFrame maxWidthClass="max-w-5xl">
      <ClassCommerceProductsClient venueId={staff.venue_id} />
    </PageFrame>
  );
}
