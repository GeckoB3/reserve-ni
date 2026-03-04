import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { SettingsView } from './SettingsView';
import { getDashboardStaff } from '@/lib/venue-auth';

export default async function SettingsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    redirect('/login?redirectTo=/dashboard/settings');
  }

  const staff = await getDashboardStaff(supabase);
  const venueId = staff.venue_id;
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

  let venue = null;
  const { data: fullVenue, error: fullErr } = await staff.db
    .from('venues')
    .select('id, name, slug, address, phone, email, cover_photo_url, cuisine_type, price_band, no_show_grace_minutes, kitchen_email, communication_templates, opening_hours, booking_rules, deposit_config, availability_config, stripe_connected_account_id, timezone')
    .eq('id', venueId)
    .single();

  if (fullVenue) {
    venue = fullVenue;
  } else {
    console.error('Settings page full venue query failed, trying basic columns:', fullErr?.message);
    const { data: basicVenue } = await staff.db
      .from('venues')
      .select('id, name, slug, address, phone, email, cover_photo_url, opening_hours, booking_rules, deposit_config, availability_config, timezone')
      .eq('id', venueId)
      .single();
    if (basicVenue) {
      venue = {
        ...basicVenue,
        cuisine_type: null,
        price_band: null,
        no_show_grace_minutes: 15,
        kitchen_email: null,
        communication_templates: null,
        stripe_connected_account_id: null,
      };
    }
  }

  const isAdmin = staff.role === 'admin';

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
