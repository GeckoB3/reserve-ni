import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getDashboardStaff } from '@/lib/venue-auth';
import { ImportTerminologyProvider } from '@/components/import/ImportTerminologyContext';
import { getVenueImportTerminology } from '@/lib/import/server-terminology';

export default async function ImportSectionLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const staff = await getDashboardStaff(supabase);
  if (!staff?.venue_id || staff.role !== 'admin') {
    redirect('/dashboard');
  }

  const terms = await getVenueImportTerminology(staff.venue_id);

  return <ImportTerminologyProvider value={{ clientLabel: terms.client }}>{children}</ImportTerminologyProvider>;
}
