import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { getSupabaseAdminClient } from '@/lib/supabase';
import { DashboardSidebar } from './DashboardSidebar';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    redirect('/login?redirectTo=/dashboard');
  }

  const email = user.email ?? '';
  let venueName: string | undefined;
  try {
    const admin = getSupabaseAdminClient();
    const { data: staffRows } = await admin
      .from('staff')
      .select('venue_id')
      .ilike('email', email.toLowerCase().trim())
      .limit(1);
    const venueId = staffRows?.[0]?.venue_id;
    if (venueId) {
      const { data: venue } = await admin
        .from('venues')
        .select('name')
        .eq('id', venueId)
        .single();
      venueName = venue?.name ?? undefined;
    }
  } catch {
    // Non-critical; sidebar still renders without venue name
  }

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      <DashboardSidebar email={email} venueName={venueName} />
      <main className="flex-1 overflow-y-auto pt-14 lg:pt-0">
        {children}
      </main>
    </div>
  );
}
