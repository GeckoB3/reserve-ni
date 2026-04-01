'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { getBusinessConfig, formatSignupBusinessTypeLabel, isSignupSupportedBookingModel } from '@/lib/business-config';
import { STANDARD_PRICE_PER_CALENDAR, BUSINESS_PRICE, FOUNDING_PARTNER_CAP } from '@/lib/pricing-constants';

export default function PlanPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [businessType, setBusinessType] = useState<string | null>(null);
  const [plan, setPlan] = useState<'standard' | 'business' | 'founding'>('standard');
  const [calendarCount, setCalendarCount] = useState(1);
  const [foundingRemaining, setFoundingRemaining] = useState<number | null>(null);

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      const bt = sessionStorage.getItem('signup_business_type');
      if (!bt) {
        router.push('/signup/business-type');
        return;
      }
      setBusinessType(bt);
    });
    return () => cancelAnimationFrame(id);
  }, [router]);

  const config = useMemo(
    () => (businessType ? getBusinessConfig(businessType) : null),
    [businessType],
  );

  useEffect(() => {
    if (!config) return;
    if (!isSignupSupportedBookingModel(config.model)) {
      sessionStorage.removeItem('signup_business_type');
      router.replace('/signup/business-type');
    }
  }, [config, router]);

  const isRestaurant = config?.model === 'table_reservation';

  useEffect(() => {
    if (!isRestaurant) return;
    const wantFounding = searchParams.get('plan') === 'founding';
    if (!wantFounding) {
      const id = requestAnimationFrame(() => {
        setPlan('business');
        setFoundingRemaining(null);
      });
      return () => cancelAnimationFrame(id);
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/signup/founding-spots');
        const data = (await res.json()) as { remaining?: number };
        const rem = typeof data.remaining === 'number' ? data.remaining : 0;
        if (cancelled) return;
        setFoundingRemaining(rem);
        if (rem > 0) setPlan('founding');
        else setPlan('business');
      } catch {
        if (!cancelled) {
          setFoundingRemaining(0);
          setPlan('business');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isRestaurant, searchParams]);

  const calendarLabel = useMemo(() => {
    if (!config) return 'calendar';
    if (config.model === 'unified_scheduling' || config.model === 'practitioner_appointment') {
      return config.terms.staff.toLowerCase();
    }
    return 'calendar';
  }, [config]);

  const standardTotal = calendarCount * STANDARD_PRICE_PER_CALENDAR;
  const showCrossoverNudge =
    calendarCount * STANDARD_PRICE_PER_CALENDAR > BUSINESS_PRICE;
  function handleContinue() {
    sessionStorage.setItem('signup_plan', plan);
    sessionStorage.setItem('signup_calendar_count', String(isRestaurant ? 1 : calendarCount));
    router.push('/signup/payment');
  }

  if (!businessType || !config) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-200 border-t-brand-600" />
      </div>
    );
  }

  if (isRestaurant) {
    const foundingFromLink = searchParams.get('plan') === 'founding';
    const showFoundingChoice = foundingFromLink && foundingRemaining !== null && foundingRemaining > 0;

    if (foundingFromLink && foundingRemaining === null) {
      return (
        <div className="flex min-h-[40vh] w-full max-w-xl flex-col items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-200 border-t-brand-600" />
          <p className="mt-3 text-sm text-slate-500">Checking availability…</p>
        </div>
      );
    }

    if (showFoundingChoice) {
      return (
        <div className="w-full max-w-xl">
          <div className="mb-8 text-center">
            <h1 className="text-2xl font-bold text-slate-900">Founding Partner</h1>
            <p className="mt-2 text-sm text-slate-500">
              Your selection: {formatSignupBusinessTypeLabel(businessType)}
            </p>
          </div>
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50/40 p-6 shadow-sm">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-bold text-slate-900">Founding Partner</h2>
              <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
                {foundingRemaining} of {FOUNDING_PARTNER_CAP} spots remaining
              </span>
            </div>
            <p className="mt-3 text-sm text-slate-700">
              Business plan free for 6 months, then &pound;{BUSINESS_PRICE}/month. Full access including SMS reminders,
              deposit collection, and table management.
            </p>
            <ul className="mt-4 space-y-2 text-sm text-slate-600">
              <FeatureItem text="Unlimited calendars" />
              <FeatureItem text="SMS reminders and confirm-or-cancel via SMS" />
              <FeatureItem text="Table management with timeline grid and floor plan" />
              <FeatureItem text="Priority support" />
            </ul>
          </div>
          <div className="mt-8 flex justify-center">
            <button
              type="button"
              onClick={handleContinue}
              className="rounded-xl bg-emerald-600 px-8 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 transition-colors"
            >
              Activate Founding Partner Plan
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="w-full max-w-xl">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-slate-900">Your plan</h1>
          <p className="mt-2 text-sm text-slate-500">
            Your selection: {formatSignupBusinessTypeLabel(businessType)}
          </p>
        </div>
        <div className="rounded-2xl border border-brand-200 bg-brand-50/30 p-6 shadow-sm">
          <h2 className="text-lg font-bold text-slate-900">Reserve NI Business — &pound;{BUSINESS_PRICE}/month</h2>
          <ul className="mt-4 space-y-2 text-sm text-slate-600">
            <FeatureItem text="Unlimited calendars" />
            <FeatureItem text="SMS reminders" />
            <FeatureItem text="Confirm-or-cancel via SMS" />
            <FeatureItem text="Table management with timeline grid and floor plan" />
            <FeatureItem text="Priority support" />
          </ul>
          <p className="mt-4 text-sm text-slate-600">
            The Business plan includes everything you need to manage your restaurant, including SMS reminders, deposit
            collection, and table management.
          </p>
        </div>
        <div className="mt-8 flex justify-center">
          <button
            type="button"
            onClick={handleContinue}
            className="rounded-xl bg-brand-600 px-8 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 transition-colors"
          >
            Continue to Payment
          </button>
        </div>
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
        <div
          role="button"
          tabIndex={0}
          onClick={() => setPlan('standard')}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setPlan('standard');
            }
          }}
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
            <span className="text-sm text-slate-500">/month per {calendarLabel}</span>
          </div>

          {plan === 'standard' && (
            <div className="mt-4">
              <label className="text-sm font-medium text-slate-700">
                How many {calendarLabel}s will use Reserve NI?
              </label>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setCalendarCount(1);
                  }}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  Just me (&pound;{STANDARD_PRICE_PER_CALENDAR})
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setCalendarCount(2);
                  }}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  2 (&pound;{STANDARD_PRICE_PER_CALENDAR * 2})
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setCalendarCount(3);
                  }}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  3 (&pound;{STANDARD_PRICE_PER_CALENDAR * 3})
                </button>
              </div>
              <div className="mt-3 flex items-center gap-3">
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
                    setCalendarCount(Math.min(30, calendarCount + 1));
                  }}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
                >
                  +
                </button>
              </div>
              <p className="mt-2 text-sm font-semibold text-brand-600">
                {calendarCount} &times; &pound;{STANDARD_PRICE_PER_CALENDAR}/month = &pound;{standardTotal}/month
              </p>
              {showCrossoverNudge && (
                <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  <p>
                    At {calendarCount} team members, that&apos;s &pound;{standardTotal}/month. The Business plan is
                    &pound;{BUSINESS_PRICE}/month for unlimited team members plus SMS reminders and priority support.
                  </p>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setPlan('business');
                    }}
                    className="mt-2 font-semibold text-amber-950 underline hover:no-underline"
                  >
                    Switch to Business
                  </button>
                </div>
              )}
            </div>
          )}

          <ul className="mt-4 space-y-2 text-sm text-slate-600">
            <FeatureItem text="Clients book online 24/7" />
            <FeatureItem text="Automated email reminders" />
            <FeatureItem text="One-tap confirm or cancel via email" />
            <FeatureItem text="Collect deposits at booking" />
            <FeatureItem text="Full schedule at a glance" />
            <FeatureItem text="Client records with visit history" />
            <FeatureItem text="Your own branded booking page" />
          </ul>
          {plan === 'standard' && (
            <p className="mt-4 text-center text-xs font-semibold text-slate-500">Continue with Standard (next step)</p>
          )}
        </div>

        <div
          role="button"
          tabIndex={0}
          onClick={() => setPlan('business')}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setPlan('business');
            }
          }}
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
            <span className="text-3xl font-extrabold text-slate-900">&pound;{BUSINESS_PRICE}</span>
            <span className="text-sm text-slate-500">/month</span>
          </div>
          <ul className="mt-4 space-y-2 text-sm text-slate-600">
            <FeatureItem text="Everything in Standard" />
            <FeatureItem text="SMS reminders that actually get read" />
            <FeatureItem text="Confirm-or-cancel via text" />
            <FeatureItem text="Unlimited team members at one flat price" />
            <FeatureItem text="Priority support" />
          </ul>
          <p className="mt-4 text-xs font-medium text-slate-500">Best value for teams of 8+</p>
          {plan === 'business' && (
            <p className="mt-2 text-center text-xs font-semibold text-brand-600">Continue with Business (next step)</p>
          )}
        </div>
      </div>

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
