import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { SettingsView } from './SettingsView';
import { getDashboardStaff } from '@/lib/venue-auth';
import { getSupabaseAdminClient } from '@/lib/supabase';

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{
    tab?: string;
    upgraded?: string;
    downgraded?: string;
    resubscribed?: string;
  }>;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    redirect('/login?redirectTo=/dashboard/settings');
  }

  const staff = await getDashboardStaff(supabase);
  if (staff.role !== 'admin') {
    redirect('/dashboard');
  }

  const venueId = staff.venue_id;
  if (!venueId) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <p className="text-slate-500">No venue linked to your account.</p>
        </div>
      </div>
    );
  }

  let venue = null;
  let hasServiceConfig = false;
  const { data: fullVenue, error: fullErr } = await staff.db
    .from('venues')
    .select('id, name, slug, address, phone, email, cover_photo_url, cuisine_type, price_band, no_show_grace_minutes, kitchen_email, communication_templates, opening_hours, booking_rules, deposit_config, availability_config, stripe_connected_account_id, timezone, table_management_enabled, combination_threshold, pricing_tier, plan_status, calendar_count, booking_model')
    .eq('id', venueId)
    .single();

  if (fullVenue) {
    venue = fullVenue;
  } else {
    console.error('Settings page full venue query failed, trying basic columns:', fullErr?.message);
    const { data: basicVenue } = await staff.db
      .from('venues')
      .select('id, name, slug, address, phone, email, cover_photo_url, opening_hours, booking_rules, deposit_config, availability_config, timezone, table_management_enabled, combination_threshold, booking_model')
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
        table_management_enabled: basicVenue.table_management_enabled ?? false,
        combination_threshold: basicVenue.combination_threshold ?? 80,
      };
    }
  }

  const bookingModel = ((venue as Record<string, unknown>)?.booking_model as string) ?? 'table_reservation';
  if (venueId) {
    if (bookingModel === 'practitioner_appointment') {
      const { count } = await staff.db
        .from('appointment_services')
        .select('id', { count: 'exact', head: true })
        .eq('venue_id', venueId)
        .eq('is_active', true);
      hasServiceConfig = (count ?? 0) > 0;
    } else {
      const { count } = await staff.db
        .from('venue_services')
        .select('id', { count: 'exact', head: true })
        .eq('venue_id', venueId)
        .eq('is_active', true);
      hasServiceConfig = (count ?? 0) > 0;
    }
  }

  const isAdmin = true;
  let activePractitionerCount = 0;
  if (venueId && bookingModel === 'practitioner_appointment') {
    const adminClient = getSupabaseAdminClient();
    const { count } = await adminClient
      .from('practitioners')
      .select('id', { count: 'exact', head: true })
      .eq('venue_id', venueId)
      .eq('is_active', true);
    activePractitionerCount = count ?? 0;
  }

  const sp = await searchParams;
  const { tab } = sp;
  let planCheckoutReturn: 'upgraded' | 'downgraded' | 'resubscribed' | undefined;
  if (sp.upgraded === 'true') planCheckoutReturn = 'upgraded';
  else if (sp.downgraded === 'true') planCheckoutReturn = 'downgraded';
  else if (sp.resubscribed === 'true') planCheckoutReturn = 'resubscribed';

  return (
    <div className="p-4 md:p-6 lg:p-8">
      <div className="mx-auto max-w-3xl">
        <h1 className="mb-6 text-2xl font-semibold text-slate-900">Settings</h1>
        <SettingsView
          initialVenue={venue ?? null}
          isAdmin={isAdmin}
          initialTab={tab}
          planCheckoutReturn={planCheckoutReturn}
          hasServiceConfig={hasServiceConfig}
          bookingModel={bookingModel}
          activePractitionerCount={activePractitionerCount}
        />
      </div>
    </div>
  );
}
