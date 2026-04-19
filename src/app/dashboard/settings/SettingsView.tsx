'use client';

/**
 * Dashboard settings shell. For `unified_scheduling` venues, sections map broadly to plan §9.1:
 * business profile → ProfileSection / VenueProfileSection; opening hours & closures → Business Hours tab;
 * bookable calendars & staff → StaffSection;
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
import { BookingRulesSection } from './sections/BookingRulesSection';
import { BookingTypesSection } from './sections/BookingTypesSection';
import { StaffPersonalSettingsSection } from './sections/StaffPersonalSettingsSection';
import { isUnifiedSchedulingVenue } from '@/lib/booking/unified-scheduling';
import { computeSmsMonthlyAllowance } from '@/lib/billing/sms-allowance';
import {
  APPOINTMENTS_LIGHT_PRICE,
  APPOINTMENTS_PRICE,
  RESTAURANT_PRICE,
  SMS_LIGHT_GBP_PER_MESSAGE,
  SMS_OVERAGE_GBP_PER_MESSAGE,
} from '@/lib/pricing-constants';
import { normalizeEnabledModels } from '@/lib/booking/enabled-models';
import type { BookingModel } from '@/types/booking-models';
import { isRestaurantTableProductTier } from '@/lib/tier-enforcement';

interface SettingsViewProps {
  initialVenue: VenueSettings | null;
  isAdmin: boolean;
  initialTab?: string;
  /** Set after Stripe checkout for plan changes (webhook may lag behind redirect). */
  planCheckoutReturn?: 'upgraded' | 'downgraded' | 'resubscribed' | 'light_sms_setup';
  hasServiceConfig?: boolean;
  bookingModel?: string;
  /** Light plan: SMS count matches Stripe subscription period (sms_log). */
  smsCountUsesStripePeriod?: boolean;
}

const TABS = [
  { key: 'profile', label: 'Profile' },
  { key: 'business-hours', label: 'Business Hours' },
  { key: 'plan', label: 'Plan' },
  { key: 'payments', label: 'Payments' },
  { key: 'comms', label: 'Communications' },
  { key: 'staff', label: 'Staff' },
  { key: 'data-import', label: 'Data Import' },
] as const;

type TabKey = typeof TABS[number]['key'];

function resolveInitialTab(initialTab: string | undefined, isAdmin: boolean): TabKey {
  const t = initialTab as TabKey | undefined;
  if (t && TABS.some((x) => x.key === t)) {
    if (t === 'staff' && !isAdmin) return 'profile';
    if (t === 'data-import' && !isAdmin) return 'profile';
    return t;
  }
  return 'profile';
}

function PlanSection({
  venue,
  bookingModel,
  smsCountUsesStripePeriod = false,
}: {
  venue: VenueSettings;
  bookingModel?: string;
  smsCountUsesStripePeriod?: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [planSuccess, setPlanSuccess] = useState<string | null>(null);
  const planSuccessLoaded = useRef(false);

  const tier = venue.pricing_tier ?? 'appointments';
  const planStatus = venue.plan_status ?? 'active';
  const isLight = tier === 'light';
  const unified = isUnifiedSchedulingVenue(bookingModel);
  const tierLabel =
    tier === 'founding'
      ? 'Founding Partner'
      : tier === 'restaurant'
        ? 'Restaurant'
        : tier === 'light'
          ? 'Appointments Light'
          : 'Appointments';
  const periodEndLabel = venue.subscription_current_period_end
    ? new Date(venue.subscription_current_period_end).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : null;
  const freePeriodEndLabel = venue.light_plan_free_period_ends_at
    ? new Date(venue.light_plan_free_period_ends_at).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : null;
  const billingActive = planStatus === 'active' || planStatus === 'trialing';
  const isCancelling = planStatus === 'cancelling';
  const hasStripeSub = Boolean(venue.stripe_subscription_id?.trim());

  const freeEndMs = venue.light_plan_free_period_ends_at
    ? new Date(venue.light_plan_free_period_ends_at).getTime()
    : NaN;
  const inFreeWindow = !Number.isNaN(freeEndMs) && freeEndMs > Date.now();

  const lightTrialNoCard =
    isLight && !hasStripeSub && inFreeWindow && billingActive && !isCancelling;
  const lightTrialWithCard =
    isLight && hasStripeSub && planStatus === 'trialing' && billingActive && !isCancelling;
  const lightPaying = isLight && hasStripeSub && planStatus === 'active' && !isCancelling;
  const lightCancelling = isLight && isCancelling;
  const lightCancelled = isLight && planStatus === 'cancelled';

  const standardPlanCancelled = !isLight && planStatus === 'cancelled';
  const standardPlanCancelling = !isLight && isCancelling;

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
      const data = (await res.json()) as { redirect_url?: string; ok?: boolean; message?: string; error?: string };
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

  async function postLightPlan(path: string) {
    setLoading(true);
    setActionError(null);
    setPlanSuccess(null);
    try {
      const res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' } });
      const data = (await res.json()) as { redirect_url?: string; ok?: boolean; message?: string; error?: string };
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

  async function confirmDowngradeToLight() {
    const ok = window.confirm(
      'Downgrade to Appointments Light? You must have only one bookable calendar and one team login. Your Appointments subscription will be replaced by Light billing (£5/month + pay-as-you-go SMS). This cannot be undone without upgrading again.',
    );
    if (!ok) return;
    await postLightPlan('/api/venue/light-plan/downgrade-to-light');
  }

  const isRestaurantTier = tier === 'restaurant';
  const smsIncludedMonthly = computeSmsMonthlyAllowance(tier, null);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
      <h2 className="text-base font-semibold text-slate-900">Your Plan</h2>
      <p className="text-xs text-slate-600 leading-relaxed">
        {!isLight ? (
          planStatus === 'past_due' ? (
            <>
              Your last payment failed. Update your payment method so Stripe can retry the invoice and restore your plan.
            </>
          ) : standardPlanCancelled ? (
            <>
              Your paid subscription is not active anymore. Use Resubscribe below when you want to return to {tierLabel}.
            </>
          ) : standardPlanCancelling ? (
            <>
              Your subscription is scheduled to end at the close of your current billing period. You keep full access as
              normal until then; no further charges after that date.
            </>
          ) : (
            <>
              Billing runs through Stripe. If you cancel, you keep full access until the end of the period shown below; no
              further charges after that.
              {isRestaurantTier ? (
                <>
                  {' '}
                  The Restaurant plan covers dining and table-management features for this venue.
                </>
              ) : null}
              {tier === 'founding' ? (
                <>
                  {' '}
                  Founding Partner pricing is shown in the note below.
                </>
              ) : null}
            </>
          )
        ) : lightCancelled ? (
          <>This subscription is not active. You can resubscribe below if you need the plan again.</>
        ) : lightCancelling ? null : planStatus === 'past_due' ? (
          <>Your last payment failed. Update your card below to restore billing and access.</>
        ) : lightTrialNoCard ? (
          <>
            First three months are free for bookings and email (no card needed). The &pound;{APPOINTMENTS_LIGHT_PRICE}/month
            plan fee starts when your free period ends, not when you add a card. Add a card anytime to send SMS at &pound;
            {SMS_LIGHT_GBP_PER_MESSAGE.toFixed(2)} each. Add a card before your free period ends to stay on Light after that.
          </>
        ) : lightTrialWithCard ? (
          <>
            The &pound;{APPOINTMENTS_LIGHT_PRICE}/month subscription charge starts when your free period ends, not when you
            added your card. SMS is &pound;{SMS_LIGHT_GBP_PER_MESSAGE.toFixed(2)} each (metered) when enabled. If you cancel,
            you keep access until the billing period below ends.
          </>
        ) : lightPaying ? (
          <>
            You are on Appointments Light at &pound;{APPOINTMENTS_LIGHT_PRICE}/month. SMS is &pound;
            {SMS_LIGHT_GBP_PER_MESSAGE.toFixed(2)} each (metered). If you cancel, you keep access until the billing period
            below ends.
          </>
        ) : (
          <>
            Appointments Light: &pound;{APPOINTMENTS_LIGHT_PRICE}/month after your free period; SMS &pound;
            {SMS_LIGHT_GBP_PER_MESSAGE.toFixed(2)} each (metered).
          </>
        )}
      </p>
      {planSuccess && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          {planSuccess}
        </div>
      )}
      <div className="flex items-center gap-3">
        <span
          className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${
            tier === 'founding'
              ? 'bg-emerald-100 text-emerald-700'
              : isRestaurantTier
                ? 'bg-brand-100 text-brand-700'
                : tier === 'light'
                  ? 'bg-sky-100 text-sky-800'
                  : 'bg-slate-100 text-slate-700'
          }`}
        >
          {tierLabel}
        </span>
        <span
          className={`text-xs font-medium ${
            billingActive
              ? 'text-green-600'
              : planStatus === 'past_due'
                ? 'text-red-600'
                : planStatus === 'cancelling'
                  ? 'text-amber-700'
                  : 'text-amber-600'
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
      {periodEndLabel && billingActive && !isCancelling && hasStripeSub && (
        <p className="text-xs text-slate-500">Current billing period ends on {periodEndLabel}.</p>
      )}
      {lightTrialNoCard && freePeriodEndLabel && (
        <p className="text-xs text-slate-600">
          Included free period ends on <span className="font-medium text-slate-800">{freePeriodEndLabel}</span>.
        </p>
      )}
      {!isLight && (
        <p className="text-sm text-slate-600">
          {isRestaurantTier
            ? 'Table management, floor plan tools, and team access included for your venue (see Dining Availability and Staff).'
            : tier === 'founding'
              ? 'Full platform features for your venue during the founding period (see note below).'
              : 'Unlimited calendars and team members.'}
        </p>
      )}
      {isLight && (
        <p className="text-sm text-slate-600">
          One bookable calendar and one venue login (no extra team seats).
        </p>
      )}
      <p className="text-sm text-slate-600">
        {isLight ? (
          smsCountUsesStripePeriod ? (
            <>SMS this billing period: </>
          ) : (
            <>SMS this calendar month: </>
          )
        ) : (
          <>SMS this billing month: </>
        )}{' '}
        <span className="font-semibold text-slate-900">{venue.sms_messages_sent_this_month ?? 0}</span>
        {isLight ? (
          <>
            {' '}
            (pay-as-you-go; each message is reported to Stripe at &pound;{SMS_LIGHT_GBP_PER_MESSAGE.toFixed(2)}).
          </>
        ) : (
          <>
            {' '}/ {smsIncludedMonthly} included. Overage beyond your allowance is billed at &pound;
            {SMS_OVERAGE_GBP_PER_MESSAGE.toFixed(2)} per SMS via Stripe metered billing.
          </>
        )}
      </p>
      {actionError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {actionError}
        </div>
      )}
      {isCancelling && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <p className="font-medium">Subscription ending</p>
          <p className="mt-1 text-amber-800">
            {periodEndLabel
              ? `Access continues until the end of your billing period (${periodEndLabel}). Stripe will not charge again after that.`
              : 'Access continues until the end of your current billing period. Stripe will not charge again after that.'}
            {isLight ? (
              <>
                {' '}
                On Appointments Light, SMS remains pay-as-you-go until then.
              </>
            ) : isRestaurantTier ? (
              <>
                {' '}
                Restaurant features remain available until that time.
              </>
            ) : tier === 'founding' ? (
              <>
                {' '}
                Founding Partner access continues until then.
              </>
            ) : null}
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
      {isLight && (
        <div className="rounded-lg border border-sky-200 bg-sky-50/80 px-3 py-3 text-sm text-sky-950 space-y-2">
          <p className="font-medium">Payment method</p>
          {planStatus === 'past_due' && hasStripeSub ? (
            <p className="text-sky-900">
              Your last payment failed. Add or replace your card so Stripe can retry the invoice and restore your booking
              page.
            </p>
          ) : hasStripeSub && planStatus !== 'past_due' ? (
            <p className="text-sky-900">Your card is on file for SMS and subscription billing.</p>
          ) : null}
          {planStatus !== 'cancelled' && (!hasStripeSub || planStatus === 'past_due') && (
            <button
              type="button"
              disabled={loading}
              onClick={() => void postLightPlan('/api/venue/light-plan/start-sms-setup')}
              className="rounded-lg bg-sky-700 px-4 py-2 text-xs font-semibold text-white hover:bg-sky-800 disabled:opacity-50"
            >
              {planStatus === 'past_due' && hasStripeSub ? 'Update card in Stripe Checkout' : 'Add card for SMS and billing'}
            </button>
          )}
        </div>
      )}
      {isLight && (
        <div className="rounded-lg border border-brand-200 bg-brand-50/80 px-3 py-3 text-sm text-brand-950">
          <p className="font-medium">Upgrade to full Appointments</p>
          <p className="mt-1 text-brand-900">
            &pound;{APPOINTMENTS_PRICE}/month: unlimited calendars and team members, higher SMS bundle. Checkout replaces your
            Light plan.
          </p>
          <button
            type="button"
            disabled={loading || planStatus === 'cancelled'}
            onClick={() => void postLightPlan('/api/venue/light-plan/upgrade-to-appointments')}
            className="mt-2 rounded-lg bg-brand-600 px-4 py-2 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
          >
            Upgrade to Appointments
          </button>
        </div>
      )}
      {tier === 'appointments' && unified && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-800">
          <p className="font-medium text-slate-900">Downgrade to Appointments Light</p>
          <p className="mt-1 text-slate-600">
            Available only when you have a single bookable calendar and one team login. You will move to &pound;
            {APPOINTMENTS_LIGHT_PRICE}/month plus pay-as-you-go SMS.
          </p>
          <button
            type="button"
            disabled={loading || !hasStripeSub || isCancelling || planStatus === 'past_due'}
            onClick={() => void confirmDowngradeToLight()}
            className="mt-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-100 disabled:opacity-50"
          >
            Downgrade to Light
          </button>
        </div>
      )}
      <div className="flex flex-wrap gap-2 pt-2">
        {billingActive && tier !== 'founding' && !isCancelling && hasStripeSub && (
          <button
            type="button"
            disabled={loading}
            onClick={() => void handleAction('cancel')}
            className="rounded-lg border border-red-200 px-4 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
          >
            Cancel plan
          </button>
        )}
        {planStatus === 'cancelled' && (
          <button
            type="button"
            disabled={loading}
            onClick={() => void handleAction('resubscribe')}
            className="rounded-lg bg-brand-600 px-4 py-2 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
          >
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
  smsCountUsesStripePeriod = false,
}: SettingsViewProps) {
  const router = useRouter();
  const isAppointment = isUnifiedSchedulingVenue(bookingModel);
  const [venue, setVenue] = useState<VenueSettings | null>(initialVenue);
  const showRestaurantTableProfileSections =
    isAdmin && isRestaurantTableProductTier(venue?.pricing_tier ?? null);
  const visibleTabs = useMemo(
    () => (isAdmin ? [...TABS] : TABS.filter((x) => x.key !== 'data-import')),
    [isAdmin],
  );
  const [activeTab, setActiveTab] = useState<TabKey>(() => resolveInitialTab(initialTab, isAdmin));
  const [planBannerDismissed, setPlanBannerDismissed] = useState(false);

  useEffect(() => {
    setVenue(initialVenue);
  }, [initialVenue]);

  useEffect(() => {
    if (!isAdmin && (activeTab === 'staff' || activeTab === 'data-import')) {
      setActiveTab('profile');
    }
  }, [isAdmin, activeTab]);

  useEffect(() => {
    if (activeTab !== 'profile') return;
    const timer = window.setTimeout(() => {
      if (typeof window === 'undefined' || window.location.hash !== '#additional-booking-types') return;
      document.getElementById('additional-booking-types')?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    }, 150);
    return () => window.clearTimeout(timer);
  }, [activeTab]);

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
        : planCheckoutReturn === 'light_sms_setup'
          ? 'Card saved. We are creating your Light subscription in Stripe; the Plan tab may take a short moment to update.'
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
            {showRestaurantTableProfileSections && !isAppointment && (
              <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-4 text-sm text-slate-700">
                <p className="font-medium text-slate-900">Table management and dining availability</p>
                <p className="mt-1 text-slate-600">
                  Floor plan, table combinations, legacy availability, and related deposit options are under{' '}
                  <Link
                    href="/dashboard/availability?tab=table"
                    className="font-medium text-brand-600 hover:text-brand-700 underline"
                  >
                    Dining Availability → Table Management
                  </Link>
                  .
                </p>
              </div>
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
        {activeTab === 'business-hours' && (
          <OpeningHoursSection venue={venue} onUpdate={onUpdate} isAdmin={isAdmin} bookingModel={bookingModel ?? 'table_reservation'} />
        )}
        {activeTab === 'plan' && (
          <PlanSection venue={venue} bookingModel={bookingModel} smsCountUsesStripePeriod={smsCountUsesStripePeriod} />
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
            serviceEngineTable={showRestaurantTableProfileSections && !isAppointment && hasServiceConfig}
            hasStripeSubscription={Boolean(venue.stripe_subscription_id?.trim())}
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
        {activeTab === 'data-import' && isAdmin && (
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-3">
            <h2 className="text-base font-semibold text-slate-900">Data import</h2>
            <p className="text-sm text-slate-600">
              Import clients and bookings from CSV exports (Fresha, Booksy, Vagaro, ResDiary, and more). The tool runs
              column mapping, validation, and a reversible import with a 24-hour undo window.
            </p>
            <Link
              href="/dashboard/import"
              className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
            >
              Open Data Import
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
