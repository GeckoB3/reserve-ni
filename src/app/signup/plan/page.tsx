'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { getBusinessConfig, formatSignupBusinessTypeLabel } from '@/lib/business-config';
import { STANDARD_PRICE_PER_CALENDAR, BUSINESS_PRICE } from '@/lib/pricing-constants';

export default function PlanPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [businessType, setBusinessType] = useState<string | null>(null);
  const [plan, setPlan] = useState<'standard' | 'business' | 'founding'>('standard');
  const [calendarCount, setCalendarCount] = useState(1);

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      const bt = sessionStorage.getItem('signup_business_type');
      if (!bt) {
        router.push('/signup/business-type');
        return;
      }
      setBusinessType(bt);

      if (searchParams.get('plan') === 'founding') {
        const btConfig = getBusinessConfig(bt);
        if (btConfig.model === 'table_reservation') {
          setPlan('founding');
        }
      }
    });
    return () => cancelAnimationFrame(id);
  }, [router, searchParams]);

  const config = useMemo(
    () => (businessType ? getBusinessConfig(businessType) : null),
    [businessType]
  );

  const calendarLabel = useMemo(() => {
    if (!config) return 'calendar';
    switch (config.model) {
      case 'practitioner_appointment':
        return config.terms.staff.toLowerCase();
      case 'resource_booking':
        return 'resource';
      case 'class_session':
        return 'class type';
      case 'event_ticket':
        return 'event';
      default:
        return 'calendar';
    }
  }, [config]);

  const standardTotal = calendarCount * STANDARD_PRICE_PER_CALENDAR;
  const showCrossoverNudge = calendarCount >= 8;
  const isFoundingEligible = config?.model === 'table_reservation';

  function handleContinue() {
    sessionStorage.setItem('signup_plan', plan);
    sessionStorage.setItem('signup_calendar_count', String(calendarCount));
    router.push('/signup/payment');
  }

  if (!businessType || !config) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-200 border-t-brand-600" />
      </div>
    );
  }

  return (
    <div className="w-full max-w-3xl">
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-bold text-slate-900">Choose your plan</h1>
        <p className="mt-2 text-sm text-slate-500">
          Pick the plan that fits your business.
        </p>
        <p className="mt-1 text-xs text-slate-400">
          Your selection: {formatSignupBusinessTypeLabel(businessType)}
        </p>
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        {/* Standard */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => setPlan('standard')}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setPlan('standard'); } }}
          className={`cursor-pointer rounded-2xl border p-6 transition-all ${
            plan === 'standard'
              ? 'border-brand-500 bg-brand-50/50 ring-1 ring-brand-500'
              : 'border-slate-200 bg-white hover:border-slate-300'
          }`}
        >
          <h2 className="text-lg font-bold text-slate-900">Standard</h2>
          <div className="mt-2 flex items-baseline gap-1">
            <span className="text-3xl font-extrabold text-slate-900">
              &pound;{STANDARD_PRICE_PER_CALENDAR}
            </span>
            <span className="text-sm text-slate-500">
              /month per {calendarLabel}
            </span>
          </div>

          {plan === 'standard' && (
            <div className="mt-4">
              <label className="text-sm font-medium text-slate-700">
                Number of {calendarLabel}s
              </label>
              <div className="mt-2 flex items-center gap-3">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setCalendarCount(Math.max(1, calendarCount - 1));
                  }}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
                >
                  -
                </button>
                <span className="w-8 text-center text-lg font-semibold">{calendarCount}</span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setCalendarCount(calendarCount + 1);
                  }}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
                >
                  +
                </button>
              </div>
              <p className="mt-2 text-sm font-semibold text-brand-600">
                Total: &pound;{standardTotal}/month
              </p>
              {showCrossoverNudge && (
                <p className="mt-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-700">
                  At {calendarCount} {calendarLabel}s, Business plan
                  (&pound;{BUSINESS_PRICE}/mo) gives you unlimited {calendarLabel}s
                  plus SMS and more.
                </p>
              )}
            </div>
          )}

          <ul className="mt-4 space-y-2 text-sm text-slate-600">
            <FeatureItem text="All booking features" />
            <FeatureItem text="Email communications" />
            <FeatureItem text="Booking page & embed widget" />
            <FeatureItem text="Real-time dashboard" />
          </ul>
        </div>

        {/* Business */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => setPlan('business')}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setPlan('business'); } }}
          className={`cursor-pointer rounded-2xl border p-6 transition-all ${
            plan === 'business'
              ? 'border-brand-500 bg-brand-50/50 ring-1 ring-brand-500'
              : 'border-slate-200 bg-white hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-900">Business</h2>
            <span className="rounded-full bg-brand-100 px-2.5 py-0.5 text-xs font-semibold text-brand-700">
              Popular
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-1">
            <span className="text-3xl font-extrabold text-slate-900">
              &pound;{BUSINESS_PRICE}
            </span>
            <span className="text-sm text-slate-500">/month</span>
          </div>
          <ul className="mt-4 space-y-2 text-sm text-slate-600">
            <FeatureItem text="Everything in Standard" />
            <FeatureItem text={`Unlimited ${calendarLabel}s`} />
            <FeatureItem text="SMS communications" />
            <FeatureItem text="Table management (restaurants)" />
            <FeatureItem text="Priority support" />
          </ul>
        </div>
      </div>

      {/* Founding Partner option */}
      {isFoundingEligible && (
        <div className="mt-6">
          <div
            role="button"
            tabIndex={0}
            onClick={() => setPlan('founding')}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setPlan('founding'); } }}
            className={`cursor-pointer rounded-2xl border p-6 transition-all ${
              plan === 'founding'
                ? 'border-emerald-500 bg-emerald-50/50 ring-1 ring-emerald-500'
                : 'border-slate-200 bg-white hover:border-slate-300'
            }`}
          >
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-bold text-slate-900">Founding Partner</h2>
              <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
                Limited
              </span>
            </div>
            <div className="mt-2 flex items-baseline gap-1">
              <span className="text-3xl font-extrabold text-slate-900">Free</span>
              <span className="text-sm text-slate-500">for 6 months</span>
            </div>
            <p className="mt-2 text-sm text-slate-500">
              Full Business-tier access for the first founding restaurants.
              Limited to 20 venues.
            </p>
          </div>
        </div>
      )}

      <div className="mt-8 flex justify-center">
        <button
          type="button"
          onClick={handleContinue}
          className="rounded-xl bg-brand-600 px-8 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 transition-colors"
        >
          Continue to {plan === 'founding' ? 'setup' : 'payment'}
        </button>
      </div>
    </div>
  );
}

function FeatureItem({ text }: { text: string }) {
  return (
    <li className="flex items-start gap-2">
      <svg
        className="mt-0.5 h-4 w-4 flex-shrink-0 text-brand-600"
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={2}
        stroke="currentColor"
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
      </svg>
      {text}
    </li>
  );
}
