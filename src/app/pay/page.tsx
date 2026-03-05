'use client';

import { useCallback, useEffect, useMemo, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { loadStripe } from '@stripe/stripe-js';
import type { Stripe } from '@stripe/stripe-js';
import Image from 'next/image';

const stripeCache = new Map<string, Promise<Stripe | null>>();

function getStripeForAccount(stripeAccountId?: string): Promise<Stripe | null> {
  const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? '';
  const cacheKey = stripeAccountId ?? '__platform__';
  if (!stripeCache.has(cacheKey)) {
    stripeCache.set(cacheKey, loadStripe(key, stripeAccountId ? { stripeAccount: stripeAccountId } : undefined));
  }
  return stripeCache.get(cacheKey)!;
}

function PayForm({ clientSecret, bookingId, onSuccess }: { clientSecret: string; bookingId: string; onSuccess: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    setError(null);
    setLoading(true);
    try {
      const { error: submitError } = await elements.submit();
      if (submitError) {
        setError(submitError.message ?? 'Please check your payment details');
        setLoading(false);
        return;
      }

      const { error: confirmError } = await stripe.confirmPayment({
        elements,
        clientSecret,
        confirmParams: {
          return_url: `${typeof window !== 'undefined' ? window.location.origin : ''}/pay/success`,
        },
        redirect: 'if_required',
      });
      if (confirmError) {
        setError(confirmError.message ?? 'Payment failed');
        setLoading(false);
        return;
      }

      // Payment succeeded client-side — confirm server-side.
      try {
        await fetch('/api/booking/confirm-payment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ booking_id: bookingId }),
        });
      } catch {
        // Non-critical — webhook will handle if this fails.
      }
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Payment failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <PaymentElement options={{ layout: 'tabs' }} />
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}
      <button type="submit" disabled={!stripe || loading} className="w-full rounded-xl bg-brand-600 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 disabled:opacity-50">
        {loading ? 'Processing…' : 'Pay deposit'}
      </button>
    </form>
  );
}

function PayContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get('t');
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [stripeAccountId, setStripeAccountId] = useState<string | undefined>(undefined);
  const [bookingId, setBookingId] = useState<string>('');
  const [status, setStatus] = useState<'loading' | 'ready' | 'success' | 'error'>('loading');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setErrorMsg('Invalid link');
      return;
    }
    fetch(`/api/booking/pay?t=${encodeURIComponent(token)}`)
      .then((r) => {
        if (!r.ok) return r.json().then((j) => Promise.reject(new Error(j.error ?? 'Failed')));
        return r.json();
      })
      .then((data) => {
        setClientSecret(data.client_secret);
        setStripeAccountId(data.stripe_account_id);
        setBookingId(data.booking_id);
        setStatus('ready');
      })
      .catch((e) => {
        setStatus('error');
        setErrorMsg(e instanceof Error ? e.message : 'Invalid or expired link');
      });
  }, [token]);

  const onSuccess = useCallback(() => {
    setStatus('success');
  }, []);

  const stripePromise = useMemo(() => getStripeForAccount(stripeAccountId), [stripeAccountId]);

  if (status === 'error') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
        <div className="w-full max-w-sm text-center">
          <Image src="/Logo.png" alt="Reserve NI" width={120} height={36} className="mx-auto mb-8 h-8 w-auto" />
          <div className="rounded-2xl border border-red-200 bg-white p-8 shadow-sm">
            <p className="text-sm text-red-600">{errorMsg}</p>
          </div>
        </div>
      </div>
    );
  }

  if (status === 'success') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
        <div className="w-full max-w-sm text-center">
          <Image src="/Logo.png" alt="Reserve NI" width={120} height={36} className="mx-auto mb-8 h-8 w-auto" />
          <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-green-100">
              <svg className="h-7 w-7 text-green-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-slate-900">Deposit paid</h2>
            <p className="mt-2 text-sm text-slate-600">
              Your deposit has been received. You&rsquo;ll get a confirmation by email or text shortly.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (status === 'loading' || !clientSecret) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-8">
      <div className="mx-auto max-w-md">
        <Image src="/Logo.png" alt="Reserve NI" width={120} height={36} className="mb-6 h-8 w-auto" />
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="text-lg font-semibold text-slate-900 mb-2">Pay your deposit</h1>
          <p className="text-sm text-slate-500 mb-6">Full refund if you cancel 48+ hours before your reservation.</p>
          <Elements
            stripe={stripePromise}
            options={{
              clientSecret,
              appearance: { theme: 'stripe', variables: { colorPrimary: '#4E6B78', borderRadius: '12px' } },
            }}
          >
            <PayForm clientSecret={clientSecret} bookingId={bookingId} onSuccess={onSuccess} />
          </Elements>
        </div>
        <p className="mt-4 text-center text-xs text-slate-400">
          Powered by <a href="https://reserveni.com" className="hover:text-brand-600">Reserve NI</a>
        </p>
      </div>
    </div>
  );
}

export default function PayPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-50 flex items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
        </div>
      }
    >
      <PayContent />
    </Suspense>
  );
}
