import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { getSupabaseAdminClient } from '@/lib/supabase';
import { DashboardSidebar } from './DashboardSidebar';
import { SessionTimeoutGuard } from '@/components/SessionTimeoutGuard';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    redirect('/login?redirectTo=/dashboard');
  }

  const email = user.email ?? '';
  let venueName: string | undefined;
  let venueSlug: string | undefined;
  let staffName: string | undefined;
  let tableManagementEnabled = false;
  let venueId: string | undefined;
  try {
    const admin = getSupabaseAdminClient();
    const { data: staffRows } = await admin
      .from('staff')
      .select('venue_id, name')
      .ilike('email', email.toLowerCase().trim())
      .limit(1);
    const staffRow = staffRows?.[0];
    staffName = staffRow?.name ?? undefined;
    venueId = staffRow?.venue_id ?? undefined;
    if (venueId) {
      const { data: venue } = await admin
        .from('venues')
        .select('name, slug, table_management_enabled')
        .eq('id', venueId)
        .single();
      venueName = venue?.name ?? undefined;
      venueSlug = venue?.slug ?? undefined;
      tableManagementEnabled = venue?.table_management_enabled ?? false;
    }
  } catch {
    // Non-critical; sidebar still renders without venue name
  }

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      <DashboardSidebar email={email} staffName={staffName} venueName={venueName} venueSlug={venueSlug} tableManagementEnabled={tableManagementEnabled} />
      <main className="flex-1 overflow-y-auto pt-14 lg:pt-0">
        {venueId && <SessionTimeoutGuard venueId={venueId} />}
        {children}
      </main>
    </div>
  );
}
