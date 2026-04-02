'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { getBusinessConfig, formatSignupBusinessTypeLabel, isDirectModelBusinessType, isSignupSupportedBookingModel } from '@/lib/business-config';
import { STANDARD_PRICE_PER_CALENDAR, BUSINESS_PRICE } from '@/lib/pricing-constants';

export default function PaymentPage() {
  const router = useRouter();
  const [businessType, setBusinessType] = useState<string | null>(null);
  const [plan, setPlan] = useState<string | null>(null);
  const [calendarCount, setCalendarCount] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      const bt = sessionStorage.getItem('signup_business_type');
      const p = sessionStorage.getItem('signup_plan');
      const cc = sessionStorage.getItem('signup_calendar_count');
      if (!bt || !p) {
        router.push('/signup/business-type');
        return;
      }
      const cfg = getBusinessConfig(bt);
      if (cfg.model === 'table_reservation' && p === 'standard') {
        sessionStorage.removeItem('signup_plan');
        router.replace('/signup/plan');
        return;
      }
      setBusinessType(bt);
      setPlan(p);
      const parsed = cc ? parseInt(cc, 10) : 1;
      setCalendarCount(Number.isNaN(parsed) || parsed < 1 ? 1 : parsed);
    });
    return () => cancelAnimationFrame(id);
  }, [router]);

  const config = useMemo(
    () => (businessType ? getBusinessConfig(businessType) : null),
    [businessType]
  );

  useEffect(() => {
    if (!config) return;
    if (!isSignupSupportedBookingModel(config.model)) {
      sessionStorage.removeItem('signup_business_type');
      sessionStorage.removeItem('signup_plan');
      sessionStorage.removeItem('signup_calendar_count');
      router.replace('/signup/business-type');
    }
  }, [config, router]);

  const totalPrice = useMemo(() => {
    if (plan === 'standard') return calendarCount * STANDARD_PRICE_PER_CALENDAR;
    if (plan === 'business') return BUSINESS_PRICE;
    return 0;
  }, [plan, calendarCount]);

  async function handleCheckout() {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/signup/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          business_type: businessType,
          plan,
          calendar_count: calendarCount,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed to start checkout.');
        setLoading(false);
        return;
      }

      if (data.redirect_url) {
        window.location.href = data.redirect_url;
        return;
      }

      setError('Unexpected response from server.');
    } catch {
      setError('Network error. Please try again.');
    }
    setLoading(false);
  }

  if (!businessType || !plan || !config) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-200 border-t-brand-600" />
      </div>
    );
  }

  const planLabel = plan === 'founding' ? 'Founding Partner' : plan === 'business' ? 'Business' : 'Standard';
  const isRestaurant = config.model === 'table_reservation';

  return (
    <div className="w-full max-w-md">
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-bold text-slate-900">Order summary</h1>
        <p className="mt-2 text-sm text-slate-500">
          Review your selection before {plan === 'founding' ? 'completing setup' : 'proceeding to payment'}.
        </p>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="space-y-4">
          <div className="flex justify-between text-sm">
            <span className="text-slate-500">
              {isDirectModelBusinessType(businessType) ? 'Booking type' : 'Business type'}
            </span>
            <span className="max-w-[60%] text-right font-medium text-slate-900">
              {formatSignupBusinessTypeLabel(businessType)}
            </span>
          </div>
          {isDirectModelBusinessType(businessType) && (
            <p className="text-xs text-slate-500">
              You chose a general booking pattern. Labels and services can be customised in onboarding and
              settings.
            </p>
          )}
          <div className="flex justify-between text-sm">
            <span className="text-slate-500">Plan</span>
            <span className="font-medium text-slate-900">{planLabel}</span>
          </div>
          {plan === 'business' && isRestaurant && (
            <div className="rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2 text-xs text-slate-600">
              <p className="font-medium text-slate-800">Reserve NI Business: &pound;{BUSINESS_PRICE}/month</p>
              <p className="mt-1">
                Unlimited team members. SMS reminders. Priority support. Table management with timeline grid and floor
                plan.
              </p>
            </div>
          )}
          {plan === 'business' && !isRestaurant && (
            <div className="rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2 text-xs text-slate-600">
              <p className="font-medium text-slate-800">Reserve NI Business: &pound;{BUSINESS_PRICE}/month</p>
              <p className="mt-1">Unlimited team members. SMS reminders. Priority support.</p>
            </div>
          )}
          {plan === 'standard' && (
            <>
              <div className="rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2 text-xs text-slate-600">
                <p className="font-medium text-slate-800">
                  Reserve NI Standard: {calendarCount} &times; &pound;{STANDARD_PRICE_PER_CALENDAR}/month = &pound;
                  {calendarCount * STANDARD_PRICE_PER_CALENDAR}/month
                </p>
                <p className="mt-1">
                  {calendarCount} bookable calendar{calendarCount === 1 ? '' : 's'}. Email reminders.
                </p>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">
                  {calendarCount === 1 ? config.terms.staff : `${config.terms.staff}s`}
                </span>
                <span className="font-medium text-slate-900">{calendarCount}</span>
              </div>
            </>
          )}
          {plan === 'founding' && isRestaurant && (
            <div className="rounded-lg border border-emerald-100 bg-emerald-50/60 px-3 py-2 text-xs text-emerald-900">
              <p className="font-medium">Founding Partner: Business plan free for 6 months, then &pound;{BUSINESS_PRICE}/month.</p>
            </div>
          )}
          <div className="border-t border-slate-100 pt-4">
            <div className="flex justify-between">
              <span className="text-base font-semibold text-slate-900">
                {plan === 'founding' ? 'Total' : 'Monthly total'}
              </span>
              <span className="text-base font-bold text-slate-900">
                {plan === 'founding' ? (
                  <>
                    <span className="text-emerald-600">Free for 6 months</span>
                  </>
                ) : (
                  <>&pound;{totalPrice}/mo</>
                )}
              </span>
            </div>
          </div>
        </div>

        {error && (
          <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
        )}

        <button
          type="button"
          onClick={handleCheckout}
          disabled={loading}
          className="mt-6 w-full rounded-xl bg-brand-600 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 disabled:opacity-50 transition-colors"
        >
          {loading
            ? 'Processing...'
            : plan === 'founding'
              ? 'Complete setup'
              : 'Proceed to payment'}
        </button>

        <p className="mt-3 text-center text-xs text-slate-500">Cancel anytime with 30 days notice.</p>
        {plan !== 'founding' && (
          <p className="mt-1 text-center text-xs text-slate-400">
            You&apos;ll be redirected to Stripe for secure payment.
          </p>
        )}
      </div>

      <div className="mt-4 text-center">
        <button
          type="button"
          onClick={() => router.back()}
          className="text-sm font-medium text-slate-400 hover:text-slate-600 transition-colors"
        >
          Go back
        </button>
      </div>
    </div>
  );
}
