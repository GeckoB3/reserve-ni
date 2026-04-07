import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { getSupabaseAdminClient } from '@/lib/supabase';
import { DashboardSidebar } from './DashboardSidebar';
import { SessionTimeoutGuard } from '@/components/SessionTimeoutGuard';
import { normalizeEnabledModels } from '@/lib/booking/enabled-models';
import type { BookingModel } from '@/types/booking-models';

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
  let pricingTier = 'appointments';
  let bookingModel: BookingModel = 'table_reservation';
  let enabledModels: BookingModel[] = [];
  let venueId: string | undefined;
  let isAdmin = false;
  let planStatus: string = 'active';
  let onboardingCompleted = true;
  let venueTerminology: Record<string, unknown> | null = null;
  try {
    const admin = getSupabaseAdminClient();
    const { data: staffRows } = await admin
      .from('staff')
      .select('venue_id, name, role')
      .ilike('email', email.toLowerCase().trim())
      .limit(1);
    const staffRow = staffRows?.[0];

    if (!staffRow?.venue_id) {
      redirect('/signup/business-type');
    }

    isAdmin = staffRow?.role === 'admin';
    staffName = staffRow?.name ?? undefined;
    venueId = staffRow?.venue_id ?? undefined;
    if (venueId) {
      const { data: venue } = await admin
        .from('venues')
        .select(
          'name, slug, table_management_enabled, booking_model, enabled_models, plan_status, onboarding_completed, pricing_tier, terminology',
        )
        .eq('id', venueId)
        .single();
      venueName = venue?.name ?? undefined;
      venueSlug = venue?.slug ?? undefined;
      tableManagementEnabled = venue?.table_management_enabled ?? false;
      pricingTier = (venue?.pricing_tier as string) ?? 'appointments';
      bookingModel = (venue?.booking_model as BookingModel) ?? 'table_reservation';
      enabledModels = normalizeEnabledModels(
        (venue as { enabled_models?: unknown } | null)?.enabled_models,
        bookingModel,
      );
      planStatus = (venue?.plan_status as string) ?? 'active';
      onboardingCompleted = (venue?.onboarding_completed as boolean) ?? true;
      const rawTerms = (venue as { terminology?: unknown } | null)?.terminology;
      venueTerminology =
        rawTerms && typeof rawTerms === 'object' && rawTerms !== null && !Array.isArray(rawTerms)
          ? (rawTerms as Record<string, unknown>)
          : null;

      if (!onboardingCompleted) {
        redirect('/onboarding');
      }
    }
  } catch (e) {
    if (e && typeof e === 'object' && 'digest' in e) throw e;
  }

  return (
    <div className="flex h-[100dvh] max-h-[100dvh] overflow-hidden bg-slate-50">
      <DashboardSidebar
        email={email}
        staffName={staffName}
        venueName={venueName}
        venueSlug={venueSlug}
        tableManagementEnabled={tableManagementEnabled}
        pricingTier={pricingTier}
        bookingModel={bookingModel}
        enabledModels={enabledModels}
        isAdmin={isAdmin}
        venueTerminology={venueTerminology}
      />
      <main className="min-h-0 flex-1 overflow-y-auto pt-[calc(3.5rem+env(safe-area-inset-top,0px))] lg:pt-0">
        {planStatus === 'cancelling' && (
          <div className="border-b border-amber-200 bg-amber-50 px-6 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-amber-900">
                Your subscription is set to end at the close of this billing period. You can keep full access until then, or resume billing below.
              </p>
              <a
                href="/dashboard/settings?tab=plan"
                className="shrink-0 rounded-lg bg-amber-700 px-4 py-1.5 text-xs font-semibold text-white hover:bg-amber-800"
              >
                Manage plan
              </a>
            </div>
          </div>
        )}
        {planStatus === 'cancelled' && (
          <div className="border-b border-amber-200 bg-amber-50 px-6 py-3">
            <div className="flex items-center justify-between">
              <p className="text-sm text-amber-800">
                Your subscription has been cancelled. Resubscribe to continue using all features.
              </p>
              <a
                href="/dashboard/settings?tab=plan"
                className="rounded-lg bg-amber-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-amber-700"
              >
                Resubscribe
              </a>
            </div>
          </div>
        )}
        {planStatus === 'past_due' && (
          <div className="border-b border-red-200 bg-red-50 px-6 py-3">
            <p className="text-sm text-red-800">
              Your last payment failed. Please update your payment method to avoid service interruption.
            </p>
          </div>
        )}
        {venueId && <SessionTimeoutGuard venueId={venueId} />}
        {children}
      </main>
    </div>
  );
}
