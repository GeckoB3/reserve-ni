'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { getBusinessConfig, formatSignupBusinessTypeLabel, isDirectModelBusinessType } from '@/lib/business-config';
import { APPOINTMENTS_PRICE, RESTAURANT_PRICE, SMS_OVERAGE_GBP_PER_MESSAGE } from '@/lib/pricing-constants';
import { SMS_INCLUDED_APPOINTMENTS, SMS_INCLUDED_RESTAURANT } from '@/lib/billing/sms-allowance';

type PlanType = 'appointments' | 'restaurant' | 'founding';

export default function PaymentPage() {
  const router = useRouter();
  const [businessType, setBusinessType] = useState<string | null>(null);
  const [plan, setPlan] = useState<PlanType | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      const bt = sessionStorage.getItem('signup_business_type');
      const p = sessionStorage.getItem('signup_plan') as PlanType | null;
      if (!bt || !p) {
        router.push('/signup/business-type');
        return;
      }
      setBusinessType(bt);
      setPlan(p);
    });
    return () => cancelAnimationFrame(id);
  }, [router]);

  const config = useMemo(
    () => (businessType ? getBusinessConfig(businessType) : null),
    [businessType]
  );

  const totalPrice = useMemo(() => {
    if (plan === 'appointments') return APPOINTMENTS_PRICE;
    if (plan === 'restaurant') return RESTAURANT_PRICE;
    return 0; // founding is free
  }, [plan]);

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

  const overagePence = Math.round(SMS_OVERAGE_GBP_PER_MESSAGE * 100);
  const isRestaurant = plan === 'restaurant';
  const isFounding = plan === 'founding';
  const smsIncluded = isRestaurant || isFounding ? SMS_INCLUDED_RESTAURANT : SMS_INCLUDED_APPOINTMENTS;
  const planLabel = isFounding ? 'Founding Partner' : isRestaurant ? 'Restaurant' : 'Appointments';

  return (
    <div className="w-full max-w-md">
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-bold text-slate-900">Order summary</h1>
        <p className="mt-2 text-sm text-slate-500">
          Review your selection before {isFounding ? 'completing setup' : 'proceeding to payment'}.
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

          {isFounding ? (
            <div className="rounded-lg border border-emerald-100 bg-emerald-50/60 px-3 py-2 text-xs text-emerald-900">
              <p className="font-medium">
                Founding Partner: Restaurant plan free for 6 months, then &pound;{RESTAURANT_PRICE}/month.
              </p>
              <p className="mt-1 leading-relaxed">
                Full access: table management, {smsIncluded} SMS per month, deposit collection, guest messaging,
                and priority support. Additional SMS at {overagePence}p each.
              </p>
            </div>
          ) : (
            <div className="rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2 text-xs text-slate-600">
              <p className="font-medium text-slate-800">
                Reserve NI {planLabel}: &pound;{totalPrice}/month
              </p>
              <p className="mt-1 leading-relaxed">
                {isRestaurant
                  ? `Table management, floor plan, all booking types. ${smsIncluded} SMS per month included. Priority support.`
                  : `All booking types: appointments, classes, events, resources. Unlimited calendars and team members. ${smsIncluded} SMS per month included.`
                }
                {' '}Additional SMS at {overagePence}p each.
              </p>
            </div>
          )}

          <div className="border-t border-slate-100 pt-4">
            <div className="flex justify-between">
              <span className="text-base font-semibold text-slate-900">
                {isFounding ? 'Total' : 'Monthly total'}
              </span>
              <span className="text-base font-bold text-slate-900">
                {isFounding ? (
                  <span className="text-emerald-600">Free for 6 months</span>
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
            : isFounding
              ? 'Complete setup'
              : 'Proceed to payment'}
        </button>

        <p className="mt-3 text-center text-xs text-slate-500">Cancel anytime with 30 days notice.</p>
        {!isFounding && (
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
