import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { SettingsView } from './SettingsView';
import { StaffPersonalSettingsSection } from './sections/StaffPersonalSettingsSection';
import { getDashboardStaff } from '@/lib/venue-auth';
import { getSupabaseAdminClient } from '@/lib/supabase';
import { isUnifiedSchedulingVenue } from '@/lib/booking/unified-scheduling';
import { normalizeEnabledModels } from '@/lib/booking/enabled-models';
import type { BookingModel } from '@/types/booking-models';
import { computeSmsMonthlyAllowance, updateVenueSmsMonthlyAllowance } from '@/lib/billing/sms-allowance';
import { parseVenueOpeningExceptions } from '@/types/venue-opening-exceptions';
import type { VenueSettings } from './types';

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

  const venueId = staff.venue_id;
  if (!venueId || !staff.id) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <p className="text-slate-500">No venue linked to your account.</p>
        </div>
      </div>
    );
  }

  /** Staff users (all booking models): personal account only, not venue-wide configuration. */
  if (staff.role === 'staff') {
    return (
      <div className="p-4 md:p-6 lg:p-8">
        <div className="mx-auto max-w-3xl">
          <h1 className="mb-2 text-2xl font-semibold text-slate-900">Account settings</h1>
          <p className="mb-6 text-sm text-slate-500">
            Update your name, email, phone, and password. Other venue settings are managed by an administrator.
          </p>
          <StaffPersonalSettingsSection />
        </div>
      </div>
    );
  }

  if (staff.role !== 'admin') {
    redirect('/dashboard');
  }

  let venue = null;
  let hasServiceConfig = false;
  const { data: fullVenue, error: fullErr } = await staff.db
    .from('venues')
    .select('id, name, slug, address, phone, email, website_url, cover_photo_url, cuisine_type, price_band, no_show_grace_minutes, kitchen_email, communication_templates, opening_hours, venue_opening_exceptions, booking_rules, deposit_config, availability_config, stripe_connected_account_id, timezone, table_management_enabled, combination_threshold, pricing_tier, plan_status, subscription_current_period_end, calendar_count, booking_model, enabled_models, sms_monthly_allowance')
    .eq('id', venueId)
    .single();

  if (fullVenue) {
    venue = {
      ...fullVenue,
      venue_opening_exceptions: parseVenueOpeningExceptions(
        (fullVenue as { venue_opening_exceptions?: unknown }).venue_opening_exceptions,
      ),
    };
    const pt = ((fullVenue as { pricing_tier?: string | null }).pricing_tier ?? 'appointments') as string;
    const cc = (fullVenue as { calendar_count?: number | null }).calendar_count ?? null;
    const expectedAllowance = computeSmsMonthlyAllowance(pt, cc);
    const stored = (fullVenue as { sms_monthly_allowance?: number | null }).sms_monthly_allowance;
    if (stored !== expectedAllowance && venueId) {
      await updateVenueSmsMonthlyAllowance(venueId);
      venue = { ...venue, sms_monthly_allowance: expectedAllowance };
    }
  } else {
    console.error('Settings page full venue query failed, trying basic columns:', fullErr?.message);
    const { data: basicVenue } = await staff.db
      .from('venues')
      .select('id, name, slug, address, phone, email, website_url, cover_photo_url, opening_hours, booking_rules, deposit_config, availability_config, timezone, table_management_enabled, combination_threshold, booking_model, enabled_models')
      .eq('id', venueId)
      .single();
    if (basicVenue) {
      const bm = (basicVenue.booking_model as BookingModel) ?? 'table_reservation';
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
        venue_opening_exceptions: [],
        enabled_models: normalizeEnabledModels(
          (basicVenue as { enabled_models?: unknown }).enabled_models,
          bm,
        ),
      } as VenueSettings;
    }
  }

  const bookingModel = ((venue as Record<string, unknown>)?.booking_model as string) ?? 'table_reservation';
  if (venue) {
    const bm = (venue.booking_model as BookingModel) ?? 'table_reservation';
    venue = {
      ...venue,
      enabled_models: normalizeEnabledModels(
        (venue as { enabled_models?: unknown }).enabled_models,
        bm,
      ),
    };
  }
  if (venueId) {
    if (isUnifiedSchedulingVenue(bookingModel)) {
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

  const isAdmin = staff.role === 'admin';
  let activePractitionerCount = 0;
  let smsMessagesSentThisMonth: number | null = null;
  if (venueId) {
    const now = new Date();
    const bm = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-01`;
    const { data: smsRow } = await staff.db
      .from('sms_usage')
      .select('messages_sent')
      .eq('venue_id', venueId)
      .eq('billing_month', bm)
      .maybeSingle();
    smsMessagesSentThisMonth = (smsRow as { messages_sent?: number } | null)?.messages_sent ?? 0;
  }
  if (venueId && isUnifiedSchedulingVenue(bookingModel)) {
    const adminClient = getSupabaseAdminClient();
    if (bookingModel === 'unified_scheduling') {
      const { count } = await adminClient
        .from('unified_calendars')
        .select('id', { count: 'exact', head: true })
        .eq('venue_id', venueId)
        .eq('is_active', true);
      activePractitionerCount = count ?? 0;
    } else {
      const { count } = await adminClient
        .from('practitioners')
        .select('id', { count: 'exact', head: true })
        .eq('venue_id', venueId)
        .eq('is_active', true);
      activePractitionerCount = count ?? 0;
    }
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
          initialVenue={
            venue
              ? { ...venue, sms_messages_sent_this_month: smsMessagesSentThisMonth }
              : null
          }
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
