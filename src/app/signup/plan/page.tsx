'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { getBusinessConfig, formatSignupBusinessTypeLabel, isSignupSupportedBookingModel } from '@/lib/business-config';
import { STANDARD_PRICE_PER_CALENDAR, BUSINESS_PRICE, FOUNDING_PARTNER_CAP } from '@/lib/pricing-constants';
import { PricingCalculator } from '@/components/landing/PricingCalculator';

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
  const isCDE =
    config?.model === 'event_ticket' ||
    config?.model === 'class_session' ||
    config?.model === 'resource_booking';

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

  function handleContinue() {
    const planToStore = isCDE ? 'business' : plan;
    sessionStorage.setItem('signup_plan', planToStore);
    sessionStorage.setItem('signup_calendar_count', String(isRestaurant || isCDE ? 1 : calendarCount));
    router.push('/signup/payment');
  }

  if (!businessType || !config) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-200 border-t-brand-600" />
      </div>
    );
  }

  if (isCDE) {
    return (
      <div className="w-full max-w-xl">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-slate-900">Your plan</h1>
          <p className="mt-2 text-sm text-slate-500">
            Your selection: {formatSignupBusinessTypeLabel(businessType)}
          </p>
        </div>
        <div className="rounded-2xl border border-brand-200 bg-brand-50/30 p-6 shadow-sm">
          <h2 className="text-lg font-bold text-slate-900">Business</h2>
          <div className="mt-2 flex items-baseline gap-1">
            <span className="text-2xl font-extrabold text-slate-900">&pound;{BUSINESS_PRICE}</span>
            <span className="text-sm text-slate-500">/month flat</span>
          </div>
          <p className="mt-2 text-sm font-medium leading-snug text-slate-700">
            Full access: event management, class timetables, or resource booking. Unlimited capacity. SMS reminders.
          </p>
          <ul className="mt-4 space-y-2 text-sm text-slate-600">
            <FeatureItem text="Unlimited events, class types, or resources" />
            <FeatureItem text="Guest SMS reminders and confirmations" />
            <FeatureItem text="Deposit and payment collection via Stripe" />
            <FeatureItem text="Priority support" />
          </ul>
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
          <h2 className="text-lg font-bold text-slate-900">Business</h2>
          <div className="mt-2 flex items-baseline gap-1">
            <span className="text-2xl font-extrabold text-slate-900">&pound;{BUSINESS_PRICE}</span>
            <span className="text-sm text-slate-500">/month flat</span>
          </div>
          <p className="mt-2 text-sm font-medium leading-snug text-slate-700">
            Unlimited calendars. 800 SMS. Table management. Priority support.
          </p>
          <p className="mt-2 text-sm font-medium leading-snug text-slate-700">Best for restaurants and large teams.</p>
          <p className="mt-2 text-xs text-slate-600">
            Restaurants use Business. Appointment-based businesses can choose Standard or Business.
          </p>
          <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Everything in Standard, plus
          </p>
          <ul className="mt-3 space-y-2 text-sm text-slate-600">
            <FeatureItem text="Unlimited bookable calendars" />
            <FeatureItem text="800 SMS messages included per month" />
            <FeatureItem text="Table management with timeline grid and floor plan (restaurants)" />
            <FeatureItem text="Priority support" />
          </ul>
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
            <span className="text-sm text-slate-500">/month per team member</span>
          </div>
          <p className="mt-2 text-sm font-medium leading-snug text-slate-700">
            All features. Best for solo practitioners and small teams.
          </p>
          <p className="mt-1 text-xs text-slate-500">200 SMS per bookable calendar per month.</p>

          <div
            className="mt-2"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
            role="presentation"
          >
            <PricingCalculator count={calendarCount} onCountChange={setCalendarCount} />
          </div>

          <ul className="mt-4 space-y-2 text-sm text-slate-600">
            <FeatureItem text="Bookings, deposits, reminders, client records, reporting" />
            <FeatureItem text="Email and SMS communications" />
            <FeatureItem text="Additional SMS at 5p each if you exceed the allowance" />
            <FeatureItem text="Email support" />
          </ul>
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
          <h2 className="text-lg font-bold text-slate-900">Business</h2>
          <div className="mt-2 flex items-baseline gap-1">
            <span className="text-3xl font-extrabold text-slate-900">&pound;{BUSINESS_PRICE}</span>
            <span className="text-sm text-slate-500">/month flat</span>
          </div>
          <p className="mt-2 text-sm font-medium leading-snug text-slate-700">
            Unlimited calendars. 800 SMS. Table management. Priority support.
          </p>
          <p className="mt-2 text-sm font-medium leading-snug text-slate-700">Best for restaurants and large teams.</p>
          <p className="mt-2 text-xs text-slate-600">
            Restaurants use Business. Appointment-based businesses can choose Standard or Business.
          </p>
          <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Everything in Standard, plus
          </p>
          <ul className="mt-3 space-y-2 text-sm text-slate-600">
            <FeatureItem text="Unlimited bookable calendars" />
            <FeatureItem text="800 SMS messages included per month" />
            <FeatureItem text="Table management with timeline grid and floor plan (restaurants)" />
            <FeatureItem text="Priority support" />
          </ul>
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
