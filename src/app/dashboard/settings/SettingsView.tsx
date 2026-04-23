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
  APPOINTMENTS_PRO_PRICE,
  planDisplayName,
  RESTAURANT_PRICE,
  SMS_LIGHT_GBP_PER_MESSAGE,
  SMS_OVERAGE_GBP_PER_MESSAGE,
} from '@/lib/pricing-constants';
import { normalizeEnabledModels } from '@/lib/booking/enabled-models';
import type { BookingModel } from '@/types/booking-models';
import { isRestaurantTableProductTier } from '@/lib/tier-enforcement';
import { PageHeader } from '@/components/ui/dashboard/PageHeader';
import { TabBar } from '@/components/ui/dashboard/TabBar';
import { SectionCard } from '@/components/ui/dashboard/SectionCard';
import { Pill } from '@/components/ui/dashboard/Pill';

interface SettingsViewProps {
  initialVenue: VenueSettings | null;
  isAdmin: boolean;
  initialTab?: string;
  /** Set after Stripe checkout for plan changes (webhook may lag behind redirect). */
  planCheckoutReturn?: 'upgraded' | 'downgraded' | 'resubscribed' | 'card_updated';
  hasServiceConfig?: boolean;
  bookingModel?: string;
  /** Light plan: SMS count matches Stripe subscription period (sms_log). */
  smsCountUsesStripePeriod?: boolean;
  /** Server: Stripe customer has invoice default payment method (Light plan). */
  initialLightHasPaymentMethod?: boolean;
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

type LightPlanStatusPayload = {
  plan_status: string | null;
  stripe_subscription_id: string | null;
  has_default_payment_method: boolean;
  stripe_subscription_status: string | null;
  subscription_current_period_start: string | null;
  subscription_current_period_end: string | null;
};

function PlanSection({
  venue,
  bookingModel,
  smsCountUsesStripePeriod = false,
  onVenueUpdate,
  initialLightHasPaymentMethod,
}: {
  venue: VenueSettings;
  bookingModel?: string;
  smsCountUsesStripePeriod?: boolean;
  onVenueUpdate: (patch: Partial<VenueSettings>) => void;
  initialLightHasPaymentMethod?: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [planSuccess, setPlanSuccess] = useState<string | null>(null);
  const planSuccessLoaded = useRef(false);

  const tier = venue.pricing_tier ?? 'appointments';
  const planStatus = venue.plan_status ?? 'active';
  const isLight = tier === 'light';
  const [lightHasPaymentMethod, setLightHasPaymentMethod] = useState<boolean | null>(() =>
    tier === 'light'
      ? typeof initialLightHasPaymentMethod === 'boolean'
        ? initialLightHasPaymentMethod
        : null
      : null,
  );
  const unified = isUnifiedSchedulingVenue(bookingModel);
  const tierLabel = planDisplayName(tier);
  const periodEndLabel = venue.subscription_current_period_end
    ? new Date(venue.subscription_current_period_end).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : null;
  const billingActive = planStatus === 'active' || planStatus === 'trialing';
  const isCancelling = planStatus === 'cancelling';
  const hasStripeSub = Boolean(venue.stripe_subscription_id?.trim());
  const lightCardCheckPending = isLight && lightHasPaymentMethod === null;
  const hasCardOnFile = isLight && lightHasPaymentMethod === true;

  const applyLightStatus = useCallback(
    (data: LightPlanStatusPayload) => {
      setLightHasPaymentMethod(data.has_default_payment_method);
      onVenueUpdate({
        plan_status: data.plan_status ?? undefined,
        stripe_subscription_id: data.stripe_subscription_id,
        subscription_current_period_start: data.subscription_current_period_start ?? undefined,
        subscription_current_period_end: data.subscription_current_period_end ?? undefined,
      });
    },
    [onVenueUpdate],
  );

  const fetchLightPlanStatus = useCallback(async () => {
    const res = await fetch('/api/venue/light-plan/status');
    if (!res.ok) return;
    const data = (await res.json()) as LightPlanStatusPayload;
    applyLightStatus(data);
  }, [applyLightStatus]);

  useEffect(() => {
    if (!isLight) return;
    const t = window.setTimeout(() => void fetchLightPlanStatus(), 0);
    return () => clearTimeout(t);
  }, [isLight, fetchLightPlanStatus]);

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
      `Downgrade to Appointments Light? You must have only one bookable calendar and one team login. Your current subscription will be replaced by Light billing (£${APPOINTMENTS_LIGHT_PRICE}/month + pay-as-you-go SMS). This cannot be undone without upgrading again.`,
    );
    if (!ok) return;
    await postLightPlan('/api/venue/light-plan/downgrade-to-light');
  }

  const isRestaurantTier = tier === 'restaurant';
  const smsIncludedMonthly = computeSmsMonthlyAllowance(tier, null);

  const tierPillVariant: 'success' | 'brand' | 'neutral' =
    tier === 'founding' ? 'success' : isRestaurantTier ? 'brand' : 'neutral';
  const planPillVariant: 'success' | 'danger' | 'warning' | 'neutral' = billingActive
    ? 'success'
    : planStatus === 'past_due'
      ? 'danger'
      : planStatus === 'cancelling'
        ? 'warning'
        : 'neutral';
  const planPillLabel = billingActive
    ? 'Active'
    : planStatus === 'past_due'
      ? 'Payment due'
      : planStatus === 'cancelling'
        ? 'Cancelling'
        : planStatus === 'cancelled'
          ? 'Cancelled'
          : planStatus;

  return (
    <SectionCard elevated>
      <SectionCard.Header eyebrow="Billing" title="Your plan" />
      <SectionCard.Body className="space-y-4">
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
        ) : lightCardCheckPending ? (
          <>Checking your Stripe billing details…</>
        ) : lightPaying ? (
          <>
            You are on Appointments Light at &pound;{APPOINTMENTS_LIGHT_PRICE}/month. SMS is &pound;
            {SMS_LIGHT_GBP_PER_MESSAGE.toFixed(2)} each (metered). If you cancel, you keep access until the billing period
            below ends.
          </>
        ) : (
          <>
            Appointments Light: &pound;{APPOINTMENTS_LIGHT_PRICE}/month; SMS &pound;{SMS_LIGHT_GBP_PER_MESSAGE.toFixed(2)}{' '}
            each (metered). A card on file is required for your subscription and SMS billing.
          </>
        )}
      </p>
      {planSuccess ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-emerald-200/80 bg-emerald-50/70 px-3 py-2.5 text-sm text-emerald-950">
          <Pill variant="success" size="sm" dot>
            Update
          </Pill>
          <span>{planSuccess}</span>
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <Pill variant={tierPillVariant}>{tierLabel}</Pill>
        <Pill variant={planPillVariant} size="sm" dot>
          {planPillLabel}
        </Pill>
      </div>
      {periodEndLabel && billingActive && !isCancelling && hasStripeSub && (
        <p className="text-xs text-slate-500">Current billing period ends on {periodEndLabel}.</p>
      )}
      {!isLight && (
        <p className="text-sm text-slate-600">
          {isRestaurantTier
            ? 'Table management, floor plan tools, and team access included for your venue (see Dining Availability and Staff).'
            : tier === 'founding'
              ? 'Full platform features for your venue during the founding period (see note below).'
              : tier === 'plus'
                ? 'Up to 5 bookable calendars and 5 team logins.'
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
          <p className="font-medium">Billing status (Stripe)</p>
          <ul className="list-none space-y-1.5 text-sky-900">
            <li>
              <span className="font-medium text-sky-950">Subscription: </span>
              {lightCardCheckPending
                ? 'Checking…'
                : hasStripeSub
                  ? String(planStatus)
                  : 'Not linked yet — complete checkout or resubscribe if your subscription was removed.'}
            </li>
            <li>
              <span className="font-medium text-sky-950">Card on file: </span>
              {lightCardCheckPending ? 'Checking…' : hasCardOnFile ? 'Yes' : 'No'}
            </li>
          </ul>
          <p className="text-xs text-sky-900/90">
            A valid card in Stripe is required for the monthly Appointments Light fee and for incremental (pay-as-you-go)
            SMS.
          </p>
          {planStatus === 'past_due' && hasStripeSub ? (
            <p className="text-sky-900">
              Your last payment failed. Add or replace your card so Stripe can retry the invoice and restore your booking
              page.
            </p>
          ) : null}
          {planStatus !== 'cancelled' && hasStripeSub && (!hasCardOnFile || planStatus === 'past_due') ? (
            <button
              type="button"
              disabled={loading}
              onClick={() => void postLightPlan('/api/venue/light-plan/update-payment-method')}
              className="rounded-lg bg-sky-700 px-4 py-2 text-xs font-semibold text-white hover:bg-sky-800 disabled:opacity-50"
            >
              {planStatus === 'past_due' ? 'Update card in Stripe Checkout' : 'Add or update card'}
            </button>
          ) : null}
        </div>
      )}
      {isLight && (
        <div className="rounded-lg border border-brand-200 bg-brand-50/80 px-3 py-3 text-sm text-brand-950">
          <p className="font-medium">Upgrade to Appointments Pro</p>
          <p className="mt-1 text-brand-900">
            &pound;{APPOINTMENTS_PRO_PRICE}/month: unlimited calendars and team members, higher SMS bundle. Checkout replaces your
            Light plan.
          </p>
          <button
            type="button"
            disabled={loading || planStatus === 'cancelled'}
            onClick={() => void postLightPlan('/api/venue/light-plan/upgrade-to-appointments')}
            className="mt-2 rounded-lg bg-brand-600 px-4 py-2 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
          >
            Upgrade to Appointments Pro
          </button>
        </div>
      )}
      {(tier === 'appointments' || tier === 'plus') && unified && (
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
      </SectionCard.Body>
    </SectionCard>
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
  initialLightHasPaymentMethod,
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
  const tabBarTabs = useMemo(
    (): { id: TabKey; label: string }[] => visibleTabs.map((t) => ({ id: t.key, label: t.label })),
    [visibleTabs],
  );
  const [activeTab, setActiveTab] = useState<TabKey>(() => resolveInitialTab(initialTab, isAdmin));
  const [planBannerDismissed, setPlanBannerDismissed] = useState(false);

  useEffect(() => {
    setVenue(initialVenue);
  }, [initialVenue]);

  /** Refresh Light plan row from Stripe after checkout (webhook may lag behind redirect). */
  useEffect(() => {
    const tier = String(venue?.pricing_tier ?? '').toLowerCase();
    if (tier !== 'light' || !venue?.id) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch('/api/venue/light-plan/status');
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as {
          plan_status: string | null;
          stripe_subscription_id: string | null;
          subscription_current_period_start: string | null;
          subscription_current_period_end: string | null;
        };
        if (cancelled) return;
        setVenue((v) =>
          v
            ? {
                ...v,
                plan_status: data.plan_status ?? v.plan_status,
                stripe_subscription_id: data.stripe_subscription_id ?? v.stripe_subscription_id,
                subscription_current_period_start:
                  data.subscription_current_period_start ?? v.subscription_current_period_start,
                subscription_current_period_end:
                  data.subscription_current_period_end ?? v.subscription_current_period_end,
              }
            : null,
        );
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [venue?.id, venue?.pricing_tier]);

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
        : planCheckoutReturn === 'card_updated'
          ? 'Payment method updated. Stripe will retry any open invoices shortly.'
          : 'We are confirming your subscription. The Plan tab will update shortly.';

  if (!venue) {
    return (
      <SectionCard elevated>
        <SectionCard.Body className="flex min-h-[180px] items-center justify-center py-16">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
        </SectionCard.Body>
      </SectionCard>
    );
  }

  return (
    <div className="space-y-6">
      <header className="space-y-4">
        <PageHeader eyebrow="Account" title="Settings" />
        <div className="overflow-x-auto pb-0.5">
          <TabBar tabs={tabBarTabs} value={activeTab} onChange={setActiveTab} />
        </div>
      </header>
      {showPlanCheckoutBanner && (
        <div className="flex items-start justify-between gap-3 rounded-2xl border border-brand-200/80 bg-brand-50/80 px-4 py-3 text-sm text-brand-950 shadow-sm shadow-slate-900/5">
          <div className="flex min-w-0 flex-1 items-start gap-2">
            <Pill variant="brand" size="sm" dot>
              Checkout
            </Pill>
            <p className="min-w-0 flex-1 leading-relaxed">{planBannerMessage}</p>
          </div>
          <button
            type="button"
            onClick={() => {
              setPlanBannerDismissed(true);
              router.replace('/dashboard/settings?tab=plan', { scroll: false });
            }}
            className="shrink-0 rounded-xl px-2 py-1 text-xs font-semibold text-brand-800 hover:bg-brand-100"
          >
            Dismiss
          </button>
        </div>
      )}

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
              <SectionCard>
                <SectionCard.Body className="space-y-2 text-sm text-slate-700">
                  <p className="text-base font-semibold text-slate-900">Table management and dining availability</p>
                  <p>
                    Floor plan, table combinations, legacy availability, and related deposit options are under{' '}
                    <Link
                      href="/dashboard/availability?tab=table"
                      className="font-medium text-brand-600 underline hover:text-brand-700"
                    >
                      Dining Availability → Table Management
                    </Link>
                    .
                  </p>
                </SectionCard.Body>
              </SectionCard>
            )}
            {isAppointment && (
              <BookingRulesSection
                venue={venue}
                onUpdate={onUpdate}
                isAdmin={isAdmin}
                bookingModel={bookingModel}
              />
            )}
            <SectionCard elevated>
              <SectionCard.Header
                eyebrow="Embeds"
                title="Booking widget & QR code"
                description="Get embed code and a printable QR code for your booking page."
              />
              <SectionCard.Body>
                <Link
                  href="/dashboard/settings/widget"
                  className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-700"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"
                    />
                  </svg>
                  Open Widget Settings
                </Link>
              </SectionCard.Body>
            </SectionCard>
          </>
        )}
        {activeTab === 'business-hours' && (
          <OpeningHoursSection venue={venue} onUpdate={onUpdate} isAdmin={isAdmin} bookingModel={bookingModel ?? 'table_reservation'} />
        )}
        {activeTab === 'plan' && (
          <PlanSection
            key={`plan-${venue.id}-${venue.pricing_tier ?? ''}-${String(initialLightHasPaymentMethod ?? '')}`}
            venue={venue}
            bookingModel={bookingModel}
            smsCountUsesStripePeriod={smsCountUsesStripePeriod}
            onVenueUpdate={onUpdate}
            initialLightHasPaymentMethod={initialLightHasPaymentMethod}
          />
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
            pricingTier={venue.pricing_tier ?? null}
          />
        )}
        {activeTab === 'data-import' && isAdmin && (
          <SectionCard elevated>
            <SectionCard.Header
              eyebrow="Operations"
              title="Data import"
              description="Import clients and bookings from CSV exports (Fresha, Booksy, Vagaro, ResDiary, and more). The tool runs column mapping, validation, and a reversible import with a 24-hour undo window."
            />
            <SectionCard.Body>
              <Link
                href="/dashboard/import"
                className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-700"
              >
                Open Data Import
              </Link>
            </SectionCard.Body>
          </SectionCard>
        )}
      </div>
    </div>
  );
}
