'use client';

/**
 * Dashboard settings shell. For `unified_scheduling` venues, sections map broadly to plan §9.1:
 * business profile → ProfileSection / VenueProfileSection; bookable calendars & staff → StaffSection;
 * services → `/dashboard/appointment-services` (linked from staff flow); communications →
 * CommunicationTemplatesSection + venue notification APIs; plan & billing → StripeConnectSection;
 * booking page URL/widgets → dashboard home / embed docs elsewhere.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { VenueSettings } from './types';
import { ProfileSection } from './sections/ProfileSection';
import { VenueProfileSection } from './sections/VenueProfileSection';
import { OpeningHoursSection } from './sections/OpeningHoursSection';
import { StaffSection } from './sections/StaffSection';
import { CommunicationTemplatesSection } from './sections/CommunicationTemplatesSection';
import { StripeConnectSection } from './sections/StripeConnectSection';
import { TableManagementSection } from './sections/TableManagementSection';
import { AvailabilityConfigSection } from './sections/AvailabilityConfigSection';
import { BookingRulesSection } from './sections/BookingRulesSection';
import { BookingTypesSection } from './sections/BookingTypesSection';
import { StaffPersonalSettingsSection } from './sections/StaffPersonalSettingsSection';
import { isUnifiedSchedulingVenue } from '@/lib/booking/unified-scheduling';
import { computeSmsMonthlyAllowance } from '@/lib/billing/sms-allowance';
import { RESTAURANT_PRICE, SMS_OVERAGE_GBP_PER_MESSAGE } from '@/lib/pricing-constants';
import { normalizeEnabledModels } from '@/lib/booking/enabled-models';
import type { BookingModel } from '@/types/booking-models';
import { isRestaurantTableProductTier } from '@/lib/tier-enforcement';

interface SettingsViewProps {
  initialVenue: VenueSettings | null;
  isAdmin: boolean;
  initialTab?: string;
  /** Set after Stripe checkout for plan changes (webhook may lag behind redirect). */
  planCheckoutReturn?: 'upgraded' | 'downgraded' | 'resubscribed';
  hasServiceConfig?: boolean;
  bookingModel?: string;
  /** Active appointment practitioners (Model B); used for plan calendar minimums. */
  activePractitionerCount?: number;
}

const TABS = [
  { key: 'profile', label: 'Profile' },
  { key: 'plan', label: 'Plan' },
  { key: 'payments', label: 'Payments' },
  { key: 'comms', label: 'Communications' },
  { key: 'staff', label: 'Staff' },
] as const;

type TabKey = typeof TABS[number]['key'];

function resolveInitialTab(initialTab: string | undefined): TabKey {
  const t = initialTab as TabKey | undefined;
  if (t && TABS.some((x) => x.key === t)) {
    return t;
  }
  return 'profile';
}

function PlanSection({
  venue,
}: {
  venue: VenueSettings;
  activePractitionerCount?: number;
}) {
  const [loading, setLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [planSuccess, setPlanSuccess] = useState<string | null>(null);
  const planSuccessLoaded = useRef(false);

  const tier = venue.pricing_tier ?? 'appointments';
  const planStatus = venue.plan_status ?? 'active';
  const tierLabel =
    tier === 'founding' ? 'Founding Partner' :
    tier === 'restaurant' ? 'Restaurant' :
    'Appointments';
  const periodEndLabel = venue.subscription_current_period_end
    ? new Date(venue.subscription_current_period_end).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : null;
  const billingActive = planStatus === 'active' || planStatus === 'trialing';
  const isCancelling = planStatus === 'cancelling';

  useEffect(() => {
    if (planSuccessLoaded.current) return;
    planSuccessLoaded.current = true;
    try {
      const msg = sessionStorage.getItem('planSuccess');
      if (msg) {
        sessionStorage.removeItem('planSuccess');
        queueMicrotask(() => setPlanSuccess(msg));
      }
    } catch {
      /* ignore */
    }
  }, []);

  async function handleAction(action: string) {
    setLoading(true);
    setActionError(null);
    setPlanSuccess(null);
    try {
      const res = await fetch('/api/venue/change-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (data.redirect_url) {
        window.location.href = data.redirect_url;
        return;
      }
      if (data.ok) {
        if (typeof data.message === 'string' && data.message.length > 0) {
          try {
            sessionStorage.setItem('planSuccess', data.message);
          } catch {
            /* ignore */
          }
        }
        window.location.reload();
        return;
      }
      setActionError(data.error || 'Something went wrong. Please try again.');
    } catch {
      setActionError('Network error. Please check your connection and try again.');
    }
    setLoading(false);
  }

  const isRestaurantTier = tier === 'restaurant';
  const smsIncludedMonthly = computeSmsMonthlyAllowance(tier, null);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
      <h2 className="text-base font-semibold text-slate-900">Your Plan</h2>
      <p className="text-xs text-slate-600 leading-relaxed">
        Billing runs through Stripe. If you cancel, you keep full access until the end of the period shown below; no
        further charges after that.
      </p>
      {planSuccess && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          {planSuccess}
        </div>
      )}
      <div className="flex items-center gap-3">
        <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${
          tier === 'founding' ? 'bg-emerald-100 text-emerald-700' :
          isRestaurantTier ? 'bg-brand-100 text-brand-700' :
          'bg-slate-100 text-slate-700'
        }`}>
          {tierLabel}
        </span>
        <span
          className={`text-xs font-medium ${
            billingActive ? 'text-green-600' : planStatus === 'past_due' ? 'text-red-600' : planStatus === 'cancelling' ? 'text-amber-700' : 'text-amber-600'
          }`}
        >
          {billingActive
            ? 'Active'
            : planStatus === 'past_due'
              ? 'Payment due'
              : planStatus === 'cancelling'
                ? 'Cancelling'
                : planStatus === 'cancelled'
                  ? 'Cancelled'
                  : planStatus}
        </span>
      </div>
      {periodEndLabel && tier !== 'founding' && billingActive && !isCancelling && (
        <p className="text-xs text-slate-500">Current billing period ends on {periodEndLabel}.</p>
      )}
      <p className="text-sm text-slate-600">
        Unlimited calendars and team members.
      </p>
      <p className="text-sm text-slate-600">
        SMS this billing month:{' '}
        <span className="font-semibold text-slate-900">{venue.sms_messages_sent_this_month ?? 0}</span>
        {' / '}
        {smsIncludedMonthly} included. Overage beyond your allowance is billed at &pound;{SMS_OVERAGE_GBP_PER_MESSAGE.toFixed(2)} per SMS
        via Stripe metered billing.
      </p>
      {actionError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {actionError}
        </div>
      )}
      {isCancelling && tier !== 'founding' && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <p className="font-medium">Subscription ending</p>
          <p className="mt-1 text-amber-800">
            {periodEndLabel
              ? `Access continues until the end of your billing period (${periodEndLabel}). Stripe will not charge again after that.`
              : 'Access continues until the end of your current billing period. Stripe will not charge again after that.'}
          </p>
          <button
            type="button"
            disabled={loading}
            onClick={() => void handleAction('resume_subscription')}
            className="mt-3 rounded-lg bg-amber-700 px-4 py-2 text-xs font-semibold text-white hover:bg-amber-800 disabled:opacity-50"
          >
            Keep my plan
          </button>
        </div>
      )}
      {tier === 'founding' && (
        <p className="text-sm text-slate-500">
          Founding Partner: full Restaurant plan features free during your founding period; &pound;{RESTAURANT_PRICE}/month
          applies when the founding period ends.
        </p>
      )}
      <div className="flex flex-wrap gap-2 pt-2">
        {billingActive && tier !== 'founding' && !isCancelling && (
          <button type="button" disabled={loading} onClick={() => void handleAction('cancel')} className="rounded-lg border border-red-200 px-4 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50">
            Cancel plan
          </button>
        )}
        {planStatus === 'cancelled' && (
          <button type="button" disabled={loading} onClick={() => void handleAction('resubscribe')} className="rounded-lg bg-brand-600 px-4 py-2 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
            Resubscribe
          </button>
        )}
      </div>
    </div>
  );
}

export function SettingsView({
  initialVenue,
  isAdmin,
  initialTab,
  planCheckoutReturn,
  hasServiceConfig = false,
  bookingModel = 'table_reservation',
  activePractitionerCount = 0,
}: SettingsViewProps) {
  const router = useRouter();
  const isAppointment = isUnifiedSchedulingVenue(bookingModel);
  const [venue, setVenue] = useState<VenueSettings | null>(initialVenue);
  const showRestaurantTableProfileSections =
    isAdmin && isRestaurantTableProductTier(venue?.pricing_tier ?? null);
  const visibleTabs = useMemo(() => [...TABS], []);
  const [activeTab, setActiveTab] = useState<TabKey>(() => resolveInitialTab(initialTab));
  const [planBannerDismissed, setPlanBannerDismissed] = useState(false);

  useEffect(() => {
    setVenue(initialVenue);
  }, [initialVenue]);

  useEffect(() => {
    if (!planCheckoutReturn) return;
    setActiveTab('plan');
    setPlanBannerDismissed(false);
    const delays = [400, 2500, 5000];
    const timeouts = delays.map((ms) => setTimeout(() => router.refresh(), ms));
    const cleanUrl = setTimeout(() => {
      router.replace('/dashboard/settings?tab=plan', { scroll: false });
    }, 5200);
    return () => {
      timeouts.forEach(clearTimeout);
      clearTimeout(cleanUrl);
    };
  }, [planCheckoutReturn, router]);

  const onUpdate = useCallback((patch: Partial<VenueSettings>) => {
    setVenue((v) => (v ? { ...v, ...patch } : null));
  }, []);

  const showPlanCheckoutBanner = Boolean(planCheckoutReturn) && !planBannerDismissed;
  const planBannerMessage =
    planCheckoutReturn === 'upgraded'
      ? 'Payment received. We are confirming your upgrade. The Plan tab will update in a few seconds. You can also refresh the page if it still shows your old plan.'
      : planCheckoutReturn === 'downgraded'
        ? 'We are confirming your plan change. Details on the Plan tab will update shortly.'
        : 'We are confirming your subscription. The Plan tab will update shortly.';

  if (!venue) {
    return (
      <div className="flex items-center justify-center rounded-xl border border-slate-200 bg-white p-12">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {showPlanCheckoutBanner && (
        <div className="flex items-start justify-between gap-3 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-900 shadow-sm">
          <p className="min-w-0 flex-1">{planBannerMessage}</p>
          <button
            type="button"
            onClick={() => {
              setPlanBannerDismissed(true);
              router.replace('/dashboard/settings?tab=plan', { scroll: false });
            }}
            className="flex-shrink-0 rounded-lg px-2 py-1 text-xs font-medium text-brand-800 hover:bg-brand-100"
          >
            Dismiss
          </button>
        </div>
      )}
      {/* Tab navigation */}
      <div className="flex gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
        {visibleTabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? 'bg-brand-600 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="space-y-6">
        {activeTab === 'profile' && (
          <>
            {isAppointment && isAdmin ? (
              <div className="space-y-4">
                <p className="text-sm text-slate-500">
                  <span className="font-medium text-slate-700">Your login:</span> display name, sign-in email, phone, and
                  password apply to you. Business details in the sections below apply to your venue and public booking page.
                </p>
                <StaffPersonalSettingsSection />
              </div>
            ) : (
              <ProfileSection />
            )}
            <VenueProfileSection venue={venue} onUpdate={onUpdate} isAdmin={isAdmin} bookingModel={bookingModel} />
            <BookingTypesSection venue={venue} onUpdate={onUpdate} isAdmin={isAdmin} />
            <OpeningHoursSection venue={venue} onUpdate={onUpdate} isAdmin={isAdmin} bookingModel={bookingModel ?? 'table_reservation'} />
            {showRestaurantTableProfileSections && !isAppointment && (
              <TableManagementSection venue={venue} onUpdate={onUpdate} isAdmin={isAdmin} />
            )}
            {showRestaurantTableProfileSections && !isAppointment && !hasServiceConfig && (
              <AvailabilityConfigSection venue={venue} onUpdate={onUpdate} isAdmin={isAdmin} />
            )}
            {isAppointment && (
              <BookingRulesSection
                venue={venue}
                onUpdate={onUpdate}
                isAdmin={isAdmin}
                bookingModel={bookingModel}
              />
            )}
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-base font-semibold text-slate-900">Booking Widget & QR Code</h2>
              <p className="mt-1 text-sm text-slate-500">Get embed code and a printable QR code for your booking page.</p>
              <Link href="/dashboard/settings/widget" className="mt-3 inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                </svg>
                Open Widget Settings
              </Link>
            </div>
          </>
        )}
        {activeTab === 'plan' && (
          <PlanSection venue={venue} activePractitionerCount={activePractitionerCount} />
        )}
        {activeTab === 'payments' && (
          <StripeConnectSection stripeAccountId={venue.stripe_connected_account_id} isAdmin={isAdmin} />
        )}
        {activeTab === 'comms' && (
          <CommunicationTemplatesSection
            venue={venue}
            isAdmin={isAdmin}
            pricingTier={venue.pricing_tier ?? 'appointments'}
            bookingModel={bookingModel}
            enabledModels={normalizeEnabledModels(venue.enabled_models, (bookingModel as BookingModel) ?? 'table_reservation')}
            depositConfig={venue.deposit_config}
          />
        )}
        {activeTab === 'staff' && isAdmin && (
          <StaffSection
            venueId={venue.id}
            isAdmin={isAdmin}
            bookingModel={bookingModel}
            enabledModels={normalizeEnabledModels(venue.enabled_models, (bookingModel as BookingModel) ?? 'table_reservation')}
          />
        )}
      </div>
    </div>
  );
}
