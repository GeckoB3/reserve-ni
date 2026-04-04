'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { getBusinessConfig, formatSignupBusinessTypeLabel } from '@/lib/business-config';
import { APPOINTMENTS_PRICE, RESTAURANT_PRICE, FOUNDING_PARTNER_CAP, SMS_OVERAGE_GBP_PER_MESSAGE } from '@/lib/pricing-constants';
import { SMS_INCLUDED_APPOINTMENTS, SMS_INCLUDED_RESTAURANT } from '@/lib/billing/sms-allowance';

type PlanType = 'appointments' | 'restaurant' | 'founding';

export default function PlanPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [businessType, setBusinessType] = useState<string | null>(null);
  const [plan, setPlan] = useState<PlanType | null>(null);
  const [foundingRemaining, setFoundingRemaining] = useState<number | null>(null);

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      const bt = sessionStorage.getItem('signup_business_type');
      const p = sessionStorage.getItem('signup_plan') as PlanType | null;
      if (!bt) {
        router.push('/signup/business-type');
        return;
      }
      setBusinessType(bt);
      setPlan(p ?? 'appointments');
    });
    return () => cancelAnimationFrame(id);
  }, [router]);

  const config = useMemo(
    () => (businessType ? getBusinessConfig(businessType) : null),
    [businessType],
  );

  // Founding partner: check spots
  useEffect(() => {
    if (plan !== 'founding') return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/signup/founding-spots');
        const data = (await res.json()) as { remaining?: number };
        const rem = typeof data.remaining === 'number' ? data.remaining : 0;
        if (cancelled) return;
        setFoundingRemaining(rem);
        if (rem <= 0) setPlan('restaurant');
      } catch {
        if (!cancelled) {
          setFoundingRemaining(0);
          setPlan('restaurant');
        }
      }
    })();
    return () => { cancelled = true; };
  }, [plan]);

  function handleContinue() {
    if (!plan) return;
    sessionStorage.setItem('signup_plan', plan);
    // Account must exist before checkout (Stripe + Supabase). Create account, then order summary / payment.
    router.push('/signup');
  }

  if (!businessType || !config || !plan) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-200 border-t-brand-600" />
      </div>
    );
  }

  const overagePence = Math.round(SMS_OVERAGE_GBP_PER_MESSAGE * 100);

  // Founding Partner confirmation
  if (plan === 'founding') {
    if (foundingRemaining === null) {
      return (
        <div className="flex min-h-[40vh] w-full max-w-xl flex-col items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-200 border-t-brand-600" />
          <p className="mt-3 text-sm text-slate-500">Checking availability…</p>
        </div>
      );
    }

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
            Restaurant plan free for 6 months, then &pound;{RESTAURANT_PRICE}/month. Full access including SMS reminders,
            deposit collection, and table management.
          </p>
          <ul className="mt-4 space-y-2 text-sm text-slate-600">
            <FeatureItem text="Table management with timeline grid and floor plan" />
            <FeatureItem text={`${SMS_INCLUDED_RESTAURANT} SMS messages included per month`} />
            <FeatureItem text="Deposit and payment collection via Stripe" />
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

  // Standard plan confirmation (Appointments or Restaurant)
  const isRestaurant = plan === 'restaurant';
  const price = isRestaurant ? RESTAURANT_PRICE : APPOINTMENTS_PRICE;
  const smsIncluded = isRestaurant ? SMS_INCLUDED_RESTAURANT : SMS_INCLUDED_APPOINTMENTS;
  const planLabel = isRestaurant ? 'Restaurant' : 'Appointments';

  return (
    <div className="w-full max-w-xl">
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-bold text-slate-900">Your plan</h1>
        <p className="mt-2 text-sm text-slate-500">
          Your selection: {formatSignupBusinessTypeLabel(businessType)}
        </p>
      </div>
      <div className="rounded-2xl border border-brand-200 bg-brand-50/30 p-6 shadow-sm">
        <h2 className="text-lg font-bold text-slate-900">{planLabel}</h2>
        <div className="mt-2 flex items-baseline gap-1">
          <span className="text-2xl font-extrabold text-slate-900">&pound;{price}</span>
          <span className="text-sm text-slate-500">/month</span>
        </div>
        <ul className="mt-4 space-y-2 text-sm text-slate-600">
          {isRestaurant ? (
            <>
              <FeatureItem text="Table management with timeline grid and floor plan" />
              <FeatureItem text="Plus all appointment booking types if needed" />
              <FeatureItem text={`${smsIncluded} SMS messages included per month`} />
              <FeatureItem text={`Additional SMS at ${overagePence}p each`} />
              <FeatureItem text="Bookings, deposits, reminders, guest records, reporting" />
              <FeatureItem text="Priority support" />
            </>
          ) : (
            <>
              <FeatureItem text="All booking types: appointments, classes, events, resources" />
              <FeatureItem text="Unlimited calendars and team members" />
              <FeatureItem text={`${smsIncluded} SMS messages included per month`} />
              <FeatureItem text={`Additional SMS at ${overagePence}p each`} />
              <FeatureItem text="Bookings, deposits, reminders, client records, reporting" />
              <FeatureItem text="Email support" />
            </>
          )}
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
