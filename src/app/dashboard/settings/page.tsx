import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { SettingsView } from './SettingsView';

export default async function SettingsPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) {
    redirect('/login?redirectTo=/dashboard/settings');
  }

  const email = (data.claims as { email?: string }).email ?? '';
  const { data: staffRows } = await supabase
    .from('staff')
    .select('venue_id, role')
    .eq('email', email);
  const staffRow = staffRows?.[0];
  const venueId = staffRow?.venue_id;
  if (!venueId) {
    return (
      <main className="min-h-screen p-6">
        <div className="mx-auto max-w-2xl">
          <p className="text-neutral-600">No venue linked to your account. Contact support.</p>
          <Link href="/dashboard" className="mt-4 inline-block text-blue-600 underline">Back to dashboard</Link>
        </div>
      </main>
    );
  }

  const { data: venue } = await supabase
    .from('venues')
    .select('id, name, slug, address, phone, email, cover_photo_url, opening_hours, booking_rules, deposit_config, availability_config, timezone')
    .eq('id', venueId)
    .single();

  const isAdmin = staffRow?.role === 'admin';

  return (
    <main className="min-h-screen bg-neutral-50 p-6">
      <div className="mx-auto max-w-3xl">
        <div className="mb-8 flex items-center gap-4">
          <Link href="/dashboard" className="text-neutral-600 underline hover:text-neutral-900">Dashboard</Link>
          <span className="text-neutral-400">/</span>
          <h1 className="text-2xl font-semibold text-neutral-900">Venue settings</h1>
        </div>
        <SettingsView initialVenue={venue ?? null} isAdmin={isAdmin} />
      </div>
    </main>
  );
}
