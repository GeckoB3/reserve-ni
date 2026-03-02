import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { DaySheetView } from './DaySheetView';

export default async function DaySheetPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) {
    redirect('/login?redirectTo=/dashboard/day-sheet');
  }

  const email = (data.claims as { email?: string }).email ?? '';
  const { data: staffRows } = await supabase.from('staff').select('venue_id').eq('email', email);
  const venueId = staffRows?.[0]?.venue_id;

  if (!venueId) {
    return (
      <main className="min-h-screen p-6">
        <p className="text-neutral-600">No venue linked.</p>
        <Link href="/dashboard" className="mt-4 inline-block text-blue-600 underline">Dashboard</Link>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-neutral-100 p-2 md:p-4">
      <div className="mx-auto max-w-4xl">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <Link href="/dashboard" className="text-neutral-600 underline hover:text-neutral-900 text-sm">Dashboard</Link>
          <span className="text-neutral-400">/</span>
          <h1 className="text-lg font-semibold text-neutral-900 md:text-xl">Day Sheet</h1>
        </div>
        <DaySheetView venueId={venueId} />
      </div>
    </main>
  );
}
