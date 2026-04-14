'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { APPOINTMENTS_ACTIVE_MODEL_ORDER } from '@/lib/booking/active-models';
import { BOOKING_MODEL_SIGNUP_CARDS } from '@/lib/business-config';
import { createClient } from '@/lib/supabase/browser';
import { fetchPendingSignupSelection, syncPendingToSessionStorage } from '@/lib/signup-pending-client';
import { isSignupPaymentReady } from '@/lib/signup-pending-selection';
import { DEFAULT_RESTAURANT_FAMILY_BUSINESS_TYPE } from '@/lib/signup-resume';

type PlanType = 'appointments' | 'restaurant' | 'founding';

export default function BusinessTypePage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const plan = (searchParams.get('plan') ?? 'appointments') as PlanType;
  const isRestaurantPlan = plan === 'restaurant' || plan === 'founding';

  useEffect(() => {
    sessionStorage.setItem('signup_plan', plan);
    if (!isRestaurantPlan) {
      sessionStorage.removeItem('signup_business_type');
    }
  }, [isRestaurantPlan, plan]);

  useEffect(() => {
    if (!isRestaurantPlan) return;
    sessionStorage.setItem('signup_plan', plan);
    sessionStorage.setItem('signup_business_type', DEFAULT_RESTAURANT_FAMILY_BUSINESS_TYPE);
    router.replace(`/signup/plan?plan=${plan}`);
  }, [isRestaurantPlan, plan, router]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session || cancelled) return;
      const venueRes = await fetch('/api/signup/existing-plan', { credentials: 'same-origin' });
      if (!venueRes.ok || cancelled) return;
      const venue = (await venueRes.json()) as { hasVenue?: boolean };
      if (venue.hasVenue) return;
      const pending = await fetchPendingSignupSelection();
      if (cancelled) return;
      if (pending?.plan && isSignupPaymentReady(pending.plan, pending.business_type)) {
        syncPendingToSessionStorage(pending.plan, pending.business_type);
        router.replace('/signup/payment');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  function handleContinue() {
    sessionStorage.setItem('signup_plan', plan);
    router.push('/signup/plan?plan=appointments');
  }

  if (isRestaurantPlan) {
    return (
      <div className="w-full max-w-2xl py-12 text-center text-sm text-slate-500">
        Redirecting…
      </div>
    );
  }

  const appointmentCards = BOOKING_MODEL_SIGNUP_CARDS.filter((card) =>
    APPOINTMENTS_ACTIVE_MODEL_ORDER.includes(card.model),
  );

  return (
    <div className="w-full max-w-2xl">
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-bold text-slate-900">Appointments plan</h1>
        <p className="mt-2 text-sm text-slate-500">
          Appointments includes appointments, classes, events, and bookable resources from the start.
        </p>
      </div>

      <div className="mb-6 rounded-2xl border border-brand-200 bg-brand-50/40 p-5">
        <p className="text-sm font-medium text-slate-800">
          You&apos;ll choose which booking models to enable for your venue after payment, then the onboarding flow will
          guide you through setting them up.
        </p>
        <p className="mt-2 text-sm text-slate-600">
          You can enable or disable booking models later at any time from Settings.
        </p>
      </div>

      <div className="mb-8 grid gap-3 sm:grid-cols-2">
        {appointmentCards.map((card) => (
          <div key={card.model} className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
            <p className="text-sm font-semibold text-slate-900">{card.title}</p>
            <p className="mt-1 text-xs text-slate-600">{card.summary}</p>
            <p className="mt-2 text-xs text-slate-500">Examples: {card.examples}</p>
          </div>
        ))}
      </div>

      <div className="mt-8 flex justify-center">
        <button
          type="button"
          onClick={handleContinue}
          className="rounded-xl bg-brand-600 px-8 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 disabled:opacity-50 transition-colors"
        >
          Continue
        </button>
      </div>
    </div>
  );
}
