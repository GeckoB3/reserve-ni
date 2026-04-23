import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { isPlatformSuperuser } from '@/lib/platform-auth';
import { getDashboardStaff } from '@/lib/venue-auth';
import { DashboardShell } from './DashboardShell';
import { Pill } from '@/components/ui/dashboard/Pill';
import { SessionTimeoutGuard } from '@/components/SessionTimeoutGuard';
import { DashboardSWRProvider } from '@/components/providers/DashboardSWRProvider';
import {
  activeModelsToLegacyEnabledModels,
  getDefaultBookingModelFromActive,
  resolveActiveBookingModels,
} from '@/lib/booking/active-models';
import type { BookingModel } from '@/types/booking-models';
import { APPOINTMENTS_LIGHT_PRICE } from '@/lib/pricing-constants';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    redirect('/login?redirectTo=/dashboard');
  }

  if (isPlatformSuperuser(user)) {
    redirect('/super');
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
    const staff = await getDashboardStaff(supabase);
    const admin = staff.db;
    const staffId = staff.id;
    const staffRole = staff.role;

    if (!staff.venue_id) {
      redirect('/signup/business-type');
    }

    isAdmin = staffRole === 'admin';
    venueId = staff.venue_id ?? undefined;
    if (staffId) {
      const { data: selfRow } = await admin
        .from('staff')
        .select('name')
        .eq('id', staffId)
        .maybeSingle();
      staffName = selfRow?.name ?? undefined;
    }
    if (venueId) {
      const { data: venue } = await admin
        .from('venues')
        .select(
          'name, slug, table_management_enabled, booking_model, enabled_models, active_booking_models, plan_status, onboarding_completed, pricing_tier, terminology',
        )
        .eq('id', venueId)
        .single();
      venueName = venue?.name ?? undefined;
      venueSlug = venue?.slug ?? undefined;
      tableManagementEnabled = venue?.table_management_enabled ?? false;
      pricingTier = (venue?.pricing_tier as string) ?? 'appointments';
      const activeModels = resolveActiveBookingModels({
        pricingTier,
        bookingModel: venue?.booking_model as BookingModel | undefined,
        enabledModels: (venue as { enabled_models?: unknown } | null)?.enabled_models,
        activeBookingModels: (venue as { active_booking_models?: unknown } | null)?.active_booking_models,
      });
      bookingModel = getDefaultBookingModelFromActive(
        activeModels,
        (venue?.booking_model as BookingModel) ?? 'table_reservation',
      );
      enabledModels = activeModelsToLegacyEnabledModels(activeModels, bookingModel);
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
    <div className="flex h-[100dvh] max-h-[100dvh] overflow-hidden bg-slate-100">
      <DashboardShell
        initialTableManagementEnabled={tableManagementEnabled}
        sidebarRest={{
          email,
          staffName,
          venueName,
          venueSlug,
          pricingTier,
          bookingModel,
          enabledModels,
          isAdmin,
          venueTerminology,
        }}
      >
      <main className="dashboard-coarse-inputs min-h-0 flex-1 overflow-y-auto bg-slate-100/80 pt-[calc(3.5rem+env(safe-area-inset-top,0px))] lg:pt-0">
        {isAdmin ? null : (
          <div className="sr-only" aria-hidden>
            Staff users do not have plan-management access.
          </div>
        )}
        {planStatus === 'cancelling' && (
          <div className="border-b border-amber-200/80 bg-gradient-to-r from-amber-50 via-white to-amber-50/30 px-4 py-3 sm:px-6">
            <div className="mx-auto flex max-w-[1400px] flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
              <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-start">
                <Pill variant="warning" size="sm" className="w-fit shrink-0">
                  Cancelling
                </Pill>
                <p className="min-w-0 text-sm text-amber-950">
                  Your subscription is set to end at the close of this billing period. You can keep full access until
                  then, or resume billing below.
                </p>
              </div>
              {isAdmin ? (
                <a
                  href="/dashboard/settings?tab=plan"
                  className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-xl bg-amber-800 px-4 py-2.5 text-center text-sm font-semibold text-white shadow-sm hover:bg-amber-900 sm:w-auto sm:py-2 sm:text-xs"
                >
                  Manage plan
                </a>
              ) : (
                <a
                  href="/dashboard/support"
                  className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-xl bg-amber-800 px-4 py-2.5 text-center text-sm font-semibold text-white shadow-sm hover:bg-amber-900 sm:w-auto sm:py-2 sm:text-xs"
                >
                  Contact admin
                </a>
              )}
            </div>
          </div>
        )}
        {planStatus === 'cancelled' && (
          <div className="border-b border-amber-200/80 bg-gradient-to-r from-amber-50 via-white to-amber-50/30 px-4 py-3 sm:px-6">
            <div className="mx-auto flex max-w-[1400px] flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
              <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-start">
                <Pill variant="warning" size="sm" className="w-fit shrink-0">
                  Cancelled
                </Pill>
                <p className="min-w-0 text-sm text-amber-950">
                  Your subscription has been cancelled. Resubscribe to continue using all features.
                </p>
              </div>
              {isAdmin ? (
                <a
                  href="/dashboard/settings?tab=plan"
                  className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-xl bg-amber-700 px-4 py-2.5 text-center text-sm font-semibold text-white shadow-sm hover:bg-amber-800 sm:w-auto sm:py-2 sm:text-xs"
                >
                  Resubscribe
                </a>
              ) : (
                <a
                  href="/dashboard/support"
                  className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-xl bg-amber-700 px-4 py-2.5 text-center text-sm font-semibold text-white shadow-sm hover:bg-amber-800 sm:w-auto sm:py-2 sm:text-xs"
                >
                  Contact admin
                </a>
              )}
            </div>
          </div>
        )}
        {planStatus === 'past_due' && (
          <div className="border-b border-rose-200/80 bg-gradient-to-r from-rose-50 via-white to-rose-50/30 px-4 py-3 sm:px-6">
            <div className="mx-auto flex max-w-[1400px] flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
              <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-start">
                <Pill variant="danger" size="sm" className="w-fit shrink-0">
                  Billing
                </Pill>
                <p className="min-w-0 text-sm text-rose-950">
                  {pricingTier === 'light'
                    ? `Your free period has ended. Add a payment method to continue using Reserve NI at £${APPOINTMENTS_LIGHT_PRICE}/month. Your public booking page is paused until billing is active.`
                    : 'Your last payment failed. Please update your payment method to avoid service interruption.'}
                </p>
              </div>
              {isAdmin ? (
                <a
                  href="/dashboard/settings?tab=plan"
                  className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-xl bg-rose-700 px-4 py-2.5 text-center text-sm font-semibold text-white shadow-sm hover:bg-rose-800 sm:w-auto sm:py-2 sm:text-xs"
                >
                  {pricingTier === 'light' ? 'Add payment method' : 'Update billing'}
                </a>
              ) : (
                <a
                  href="/dashboard/support"
                  className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-xl bg-rose-700 px-4 py-2.5 text-center text-sm font-semibold text-white shadow-sm hover:bg-rose-800 sm:w-auto sm:py-2 sm:text-xs"
                >
                  Contact admin
                </a>
              )}
            </div>
          </div>
        )}
        {venueId && <SessionTimeoutGuard venueId={venueId} />}
        <DashboardSWRProvider>{children}</DashboardSWRProvider>
      </main>
      </DashboardShell>
    </div>
  );
}
