import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { getDashboardStaff } from '@/lib/venue-auth';
import { TableGridView } from './TableGridView';
import { ToastProvider } from '@/components/ui/Toast';

export default async function TableGridPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?redirectTo=/dashboard/table-grid');

  const staff = await getDashboardStaff(supabase);
  if (!staff.venue_id) redirect('/dashboard');

  const { data: venue } = await staff.db
    .from('venues')
    .select('table_management_enabled, currency')
    .eq('id', staff.venue_id)
    .single();

  if (!venue?.table_management_enabled) redirect('/dashboard/day-sheet');

  const currency = ((venue as { currency?: string }).currency as string) ?? 'GBP';

  return (
    <ToastProvider>
      <div className="p-2 md:p-4 lg:p-6">
        <TableGridView venueId={staff.venue_id} currency={currency} />
      </div>
    </ToastProvider>
  );
}
