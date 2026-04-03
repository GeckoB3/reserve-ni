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
import {
  SMS_INCLUDED_BUSINESS_TIER,
  SMS_INCLUDED_PER_CALENDAR_STANDARD,
  computeSmsMonthlyAllowance,
} from '@/lib/billing/sms-allowance';
import { BUSINESS_PRICE, SMS_OVERAGE_GBP_PER_MESSAGE, STANDARD_PRICE_PER_CALENDAR } from '@/lib/pricing-constants';
import { normalizeEnabledModels } from '@/lib/booking/enabled-models';
import type { BookingModel } from '@/types/booking-models';

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

const MAX_STANDARD_CALENDARS = 30;

function PlanSection({
  venue,
  activePractitionerCount = 0,
}: {
  venue: VenueSettings;
  activePractitionerCount?: number;
}) {
  const [loading, setLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [planSuccess, setPlanSuccess] = useState<string | null>(null);
  const planSuccessLoaded = useRef(false);
  const [calSaving, setCalSaving] = useState(false);
  const [calendarDraft, setCalendarDraft] = useState(venue.calendar_count ?? 1);
  const [calError, setCalError] = useState<string | null>(null);
  const minCalendars = Math.max(1, activePractitionerCount);
  const [downgradeQty, setDowngradeQty] = useState(minCalendars);

  const tier = venue.pricing_tier ?? 'standard';
  const planStatus = venue.plan_status ?? 'active';
  const calendarCount = venue.calendar_count ?? null;
  const tierLabel = tier === 'founding' ? 'Founding Partner' : tier === 'business' ? 'Business' : 'Standard';
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
    setCalendarDraft(venue.calendar_count ?? 1);
  }, [venue.calendar_count]);

  useEffect(() => {
    setDowngradeQty((q) => Math.max(minCalendars, q));
  }, [minCalendars]);

  useEffect(() => {
    if (planSuccessLoaded.current) return;
    planSuccessLoaded.current = true;
    try {
      const msg = sessionStorage.getItem('planSuccess');
      if (msg) {
        sessionStorage.removeItem('planSuccess');
        setPlanSuccess(msg);
      }
    } catch {
      /* ignore */
    }
  }, []);

  async function handleAction(action: string, opts?: { calendar_count?: number }) {
    setLoading(true);
    setActionError(null);
    setPlanSuccess(null);
    try {
      const res = await fetch('/api/venue/change-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          ...(opts?.calendar_count != null ? { calendar_count: opts.calendar_count } : {}),
        }),
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

  async function saveStandardCalendarCount() {
    setCalSaving(true);
    setCalError(null);
    try {
      const res = await fetch('/api/venue/update-subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ calendar_count: calendarDraft }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setCalError(typeof data.error === 'string' ? data.error : 'Could not update your plan. Try again or contact support.');
        return;
      }
      window.location.reload();
    } catch {
      setCalError('Network error. Check your connection and try again.');
    } finally {
      setCalSaving(false);
    }
  }

  const calendarDirty = tier === 'standard' && calendarDraft !== (venue.calendar_count ?? 1);
  const isAppointmentVenue = isUnifiedSchedulingVenue(venue.booking_model);
  const isRestaurantVenue = venue.booking_model === 'table_reservation';
  /** Restaurants must subscribe to Business; Standard should not appear in normal signup flows. */
  const restaurantOnInvalidStandard = isRestaurantVenue && tier === 'standard';
  const standardSeatsPaid = calendarCount ?? 1;
  const standardMonthlyPence = standardSeatsPaid * STANDARD_PRICE_PER_CALENDAR;
  const smsIncludedMonthly = computeSmsMonthlyAllowance(tier, calendarCount ?? null);
  const showFourPlusBusinessNudge =
    tier === 'standard' &&
    isAppointmentVenue &&
    !isRestaurantVenue &&
    calendarCount != null &&
    calendarCount >= 4;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
      <h2 className="text-base font-semibold text-slate-900">Your Plan</h2>
      <p className="text-xs text-slate-600 leading-relaxed">
        Billing runs through Stripe. Upgrades, downgrades, and{' '}
        {isAppointmentVenue ? (
          <>
            other subscription changes (including how many bookable calendars you pay for on Standard) use{' '}
          </>
        ) : (
          <>seat changes use </>
        )}
        <span className="font-medium text-slate-700">proration</span>: unused time on your current price is credited and
        only the net difference is charged for the rest of this billing period (see your Stripe invoice and customer
        portal). If you cancel, you keep full access until the end of the period shown below; no further charges after
        that.
      </p>
      {planSuccess && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          {planSuccess}
        </div>
      )}
      <div className="flex items-center gap-3">
        <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${
          tier === 'founding' ? 'bg-emerald-100 text-emerald-700' :
          tier === 'business' ? 'bg-brand-100 text-brand-700' :
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
        SMS this billing month:{' '}
        <span className="font-semibold text-slate-900">{venue.sms_messages_sent_this_month ?? 0}</span>
        {' / '}
        {smsIncludedMonthly} included
        {tier === 'standard' && calendarCount != null ? (
          <span className="text-slate-500">
            {' '}
            ({SMS_INCLUDED_PER_CALENDAR_STANDARD} × {calendarCount} paid calendar{calendarCount === 1 ? '' : 's'})
          </span>
        ) : null}
        {tier === 'business' || tier === 'founding' ? (
          <span className="text-slate-500"> ({SMS_INCLUDED_BUSINESS_TIER}/month included)</span>
        ) : null}
        . Overage beyond your allowance is billed at £{SMS_OVERAGE_GBP_PER_MESSAGE.toFixed(2)} per SMS via Stripe metered
        billing.
      </p>
      {restaurantOnInvalidStandard && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          <p className="font-medium">Restaurants must be on the Business plan</p>
          <p className="mt-1 text-xs leading-relaxed text-amber-900">
            Table management and floor plan require Business (£{BUSINESS_PRICE}/month). Upgrade below or contact support
            if this looks wrong.
          </p>
        </div>
      )}
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
      {tier === 'standard' && calendarCount != null && !restaurantOnInvalidStandard && (
        <p className="text-sm text-slate-600">
          {isAppointmentVenue ? (
            <>
              Your plan covers up to{' '}
              <span className="font-semibold text-slate-900">{calendarCount}</span> bookable calendar
              {calendarCount === 1 ? '' : 's'} (&pound;{calendarCount * STANDARD_PRICE_PER_CALENDAR}/month total).{' '}
              {billingActive && (
                <>
                  You have{' '}
                  <span className="font-semibold text-slate-900">{activePractitionerCount}</span> active.
                </>
              )}
            </>
          ) : (
            <>
              {calendarCount} slot{calendarCount === 1 ? '' : 's'} on Standard: &pound;{calendarCount * STANDARD_PRICE_PER_CALENDAR}/month
              total.
            </>
          )}
        </p>
      )}
      {tier === 'standard' && billingActive && !isCancelling && !restaurantOnInvalidStandard && (
        <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-4 space-y-3">
          <p className="text-sm font-medium text-slate-800">
            {isAppointmentVenue ? 'How many bookable calendars?' : 'Slots on your Standard plan'}
          </p>
          <p className="text-xs text-slate-600">
            {isAppointmentVenue ? (
              <>
                Each paid slot covers one bookable calendar (e.g. one team member). Each slot is &pound;{STANDARD_PRICE_PER_CALENDAR}/month.
                Increase the number to add capacity; lower it after removing calendars you no longer bill for.
              </>
            ) : (
              <>Each slot is &pound;{STANDARD_PRICE_PER_CALENDAR}/month. Change the number if your plan includes more than one.</>
            )}
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label htmlFor="plan-calendar-count" className="mb-1 block text-xs font-medium text-slate-600">
                {isAppointmentVenue ? 'Bookable calendars included' : 'Slots included'}
              </label>
              <input
                id="plan-calendar-count"
                type="number"
                min={minCalendars}
                max={MAX_STANDARD_CALENDARS}
                value={calendarDraft}
                onChange={(e) => setCalendarDraft(Math.max(minCalendars, Math.min(MAX_STANDARD_CALENDARS, parseInt(e.target.value, 10) || minCalendars)))}
                className="w-24 rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <button
              type="button"
              disabled={calSaving || !calendarDirty}
              onClick={() => void saveStandardCalendarCount()}
              className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {calSaving ? 'Saving…' : 'Update billing'}
            </button>
          </div>
          {minCalendars > 1 && isAppointmentVenue && calendarCount != null && (
            <p className="text-xs text-slate-600">
              Your current plan includes{' '}
              <span className="font-semibold text-slate-900">{calendarCount}</span> calendar
              {calendarCount === 1 ? '' : 's'}.
              {minCalendars < calendarCount ? (
                <>
                  {' '}
                  You can reduce the number for billing, but not below{' '}
                  <span className="font-semibold text-slate-900">{minCalendars}</span> while that many team members
                  are active.
                </>
              ) : null}
            </p>
          )}
          {minCalendars > 1 && !isAppointmentVenue && (
            <p className="text-xs text-amber-800">Minimum {minCalendars} for your current use.</p>
          )}
          {calError && (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{calError}</div>
          )}
        </div>
      )}
      {tier === 'business' && (
        <p className="text-sm text-slate-500">
          {isRestaurantVenue ? (
            <>
              Business plan: &pound;{BUSINESS_PRICE}/month flat. Includes guest SMS, table timeline and floor plan, day
              sheet, and priority support: the plan required for restaurants.
            </>
          ) : isAppointmentVenue ? (
            <>
              Business plan: &pound;{BUSINESS_PRICE}/month flat. Unlimited bookable calendars, {SMS_INCLUDED_BUSINESS_TIER}{' '}
              SMS/month included, priority support. Configure message templates under Communications.
            </>
          ) : (
            <>
              Business plan: &pound;{BUSINESS_PRICE}/month flat. Unlimited capacity on your subscription tier, SMS, and
              venue features included for your booking model.
            </>
          )}
        </p>
      )}
      {tier === 'founding' && (
        <p className="text-sm text-slate-500">
          {isRestaurantVenue ? (
            <>
              Founding Partner: full restaurant Business features (guest SMS, table management, floor plan), free during
              your founding period; subscription pricing applies when the founding period ends.
            </>
          ) : isAppointmentVenue ? (
            <>
              Founding Partner: unlimited bookable calendars and the same SMS allowance as Business, free during your
              founding period; subscription pricing applies when the founding period ends.
            </>
          ) : (
            <>
              Founding Partner: Business-tier access for your booking model for free during the founding period.
            </>
          )}
        </p>
      )}
      <div className="flex flex-wrap gap-2 pt-2">
        {tier === 'standard' && !isCancelling && (
          <button type="button" disabled={loading} onClick={() => void handleAction('upgrade')} className="rounded-lg bg-brand-600 px-4 py-2 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
            {isRestaurantVenue ? 'Switch to Business plan' : 'Upgrade to Business'}
          </button>
        )}
        {tier === 'business' && !isCancelling && !isRestaurantVenue && (
          <div className="w-full space-y-3 rounded-lg border border-amber-100 bg-amber-50/50 p-4">
            {isAppointmentVenue && (
              <div className="text-xs text-amber-950">
                <p className="font-medium text-amber-900">Before switching to Standard</p>
                <p className="mt-1 text-amber-900/90">
                  On Standard you would pay &pound;{downgradeQty * STANDARD_PRICE_PER_CALENDAR}/month for {downgradeQty} active calendar
                  {downgradeQty === 1 ? '' : 's'}. Included SMS drops to{' '}
                  {SMS_INCLUDED_PER_CALENDAR_STANDARD * downgradeQty}/month (Business includes {SMS_INCLUDED_BUSINESS_TIER}).
                </p>
                {downgradeQty * STANDARD_PRICE_PER_CALENDAR > BUSINESS_PRICE && (
                  <p className="mt-2 font-medium text-amber-900">
                    At this size, Standard would cost more than your current &pound;{BUSINESS_PRICE}/month Business plan.
                  </p>
                )}
              </div>
            )}
            <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-end">
              <div>
                <label htmlFor="downgrade-calendars" className="mb-1 block text-xs font-medium text-slate-600">
                  {isAppointmentVenue ? 'Calendars on Standard after switch' : 'Team members on Standard after switch'}
                </label>
                <input
                  id="downgrade-calendars"
                  type="number"
                  min={minCalendars}
                  max={MAX_STANDARD_CALENDARS}
                  value={downgradeQty}
                  onChange={(e) =>
                    setDowngradeQty(Math.max(minCalendars, Math.min(MAX_STANDARD_CALENDARS, parseInt(e.target.value, 10) || minCalendars)))
                  }
                  className="w-24 rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <button
                type="button"
                disabled={loading}
                onClick={() => {
                  let msg: string;
                  if (isAppointmentVenue) {
                    const lines = [
                      `Switch to Standard at £${downgradeQty * STANDARD_PRICE_PER_CALENDAR}/month for ${downgradeQty} calendar(s)?`,
                      `Included SMS will be ${SMS_INCLUDED_PER_CALENDAR_STANDARD * downgradeQty}/month (${SMS_INCLUDED_PER_CALENDAR_STANDARD} per calendar) vs ${SMS_INCLUDED_BUSINESS_TIER} on Business.`,
                    ];
                    if (downgradeQty * STANDARD_PRICE_PER_CALENDAR > BUSINESS_PRICE) {
                      lines.push('Standard would cost more than Business at this size.');
                    }
                    msg = lines.join('\n\n');
                  } else {
                    msg =
                      'Switch to Standard? Review pricing in your next invoice; SMS guest messaging may be more limited than on Business.';
                  }
                  if (!window.confirm(msg)) return;
                  void handleAction('downgrade', { calendar_count: downgradeQty });
                }}
                className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
              >
                Switch to Standard
              </button>
            </div>
          </div>
        )}
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
      {showFourPlusBusinessNudge && calendarCount != null && (
        <div className="rounded-lg border border-brand-200 bg-brand-50/80 p-4 text-sm text-brand-900">
          <p className="font-medium">You&apos;re paying &pound;{standardMonthlyPence}/month</p>
          <p className="mt-1 text-xs leading-relaxed">
            Business is &pound;{BUSINESS_PRICE}/month for unlimited bookable calendars, 800 SMS/month, and priority support.
            {standardMonthlyPence > BUSINESS_PRICE ? (
              <>
                {' '}
                You&apos;d save &pound;{standardMonthlyPence - BUSINESS_PRICE}/month at Business pricing.
              </>
            ) : (
              <> Compare totals and upgrade if the flat allowance and unlimited calendars suit you better.</>
            )}
          </p>
        </div>
      )}
      {tier === 'standard' && (
        <div className="mt-4 rounded-lg border border-brand-100 bg-brand-50 p-4">
          <p className="text-sm font-medium text-brand-800">
            {isRestaurantVenue ? 'Business is required for restaurants' : 'Upgrade to unlock more'}
          </p>
          <ul className="mt-2 space-y-1 text-xs text-brand-700">
            {isRestaurantVenue ? (
              <>
                <li>&bull; Table service timeline and floor plan (not available on Standard)</li>
                <li>&bull; Guest SMS at {SMS_INCLUDED_BUSINESS_TIER}/month included on Business</li>
                <li>&bull; Priority support</li>
              </>
            ) : isAppointmentVenue ? (
              <>
                <li>&bull; Higher SMS allowance ({SMS_INCLUDED_BUSINESS_TIER}/month flat)</li>
                <li>&bull; Unlimited bookable calendars</li>
                <li>&bull; Priority support</li>
              </>
            ) : (
              <>
                <li>&bull; Higher SMS allowance ({SMS_INCLUDED_BUSINESS_TIER}/month flat)</li>
                <li>&bull; Unlimited capacity on your plan type where applicable</li>
                <li>&bull; Priority support</li>
              </>
            )}
          </ul>
        </div>
      )}
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
            <OpeningHoursSection venue={venue} onUpdate={onUpdate} isAdmin={isAdmin} />
            {!isAppointment && <TableManagementSection venue={venue} onUpdate={onUpdate} isAdmin={isAdmin} />}
            {!isAppointment && !hasServiceConfig && (
              <AvailabilityConfigSection venue={venue} onUpdate={onUpdate} isAdmin={isAdmin} />
            )}
            {isAppointment && (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-700 shadow-sm">
                <p className="font-semibold text-slate-900">Services and Availability</p>
                <p className="mt-2">
                  {hasServiceConfig
                    ? 'Manage your appointment services, team members, working hours, and booking availability.'
                    : 'Set up your appointment services and team to start accepting bookings.'}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link
                    href="/dashboard/appointment-services"
                    className="inline-flex rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
                  >
                    {hasServiceConfig ? 'Manage Services' : 'Create First Service'}
                  </Link>
                  <Link
                    href="/dashboard/availability"
                    className="inline-flex rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Availability Settings
                  </Link>
                </div>
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
            pricingTier={venue.pricing_tier ?? 'standard'}
            bookingModel={bookingModel}
            enabledModels={normalizeEnabledModels(venue.enabled_models, (bookingModel as BookingModel) ?? 'table_reservation')}
            depositConfig={venue.deposit_config}
          />
        )}
        {activeTab === 'staff' && isAdmin && (
          <StaffSection venueId={venue.id} isAdmin={isAdmin} bookingModel={bookingModel} />
        )}
      </div>
    </div>
  );
}
