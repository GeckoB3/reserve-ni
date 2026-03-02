'use client';

import { useCallback, useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { getStripe } from '@/lib/stripe-client';

function PayForm({ clientSecret, onSuccess }: { clientSecret: string; onSuccess: () => void }) {
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
      const { error: confirmError } = await stripe.confirmPayment({
        elements,
        clientSecret,
        confirmParams: {
          return_url: `${typeof window !== 'undefined' ? window.location.origin : ''}/pay/success`,
        },
      });
      if (confirmError) {
        setError(confirmError.message ?? 'Payment failed');
      } else {
        onSuccess();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Payment failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <PaymentElement />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button type="submit" disabled={!stripe || loading} className="w-full rounded bg-neutral-900 px-4 py-3 text-white font-medium disabled:opacity-50">
        {loading ? 'Processing…' : 'Pay deposit'}
      </button>
    </form>
  );
}

function PayContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get('t');
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
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
      })
      .catch((e) => {
        setStatus('error');
        setErrorMsg(e instanceof Error ? e.message : 'Invalid or expired link');
      });
  }, [token]);

  const onSuccess = useCallback(() => {
    setStatus('success');
  }, []);

  if (status === 'error') {
    return (
      <main className="min-h-screen bg-neutral-50 p-6 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600">{errorMsg}</p>
        </div>
      </main>
    );
  }

  if (status === 'success') {
    return (
      <main className="min-h-screen bg-neutral-50 p-6 flex items-center justify-center">
        <div className="rounded-lg border border-green-200 bg-green-50 p-6 max-w-sm text-center">
          <p className="font-medium text-green-800">Payment received</p>
          <p className="mt-2 text-sm text-green-700">Your deposit has been paid. You will receive a confirmation by email or SMS shortly.</p>
        </div>
      </main>
    );
  }

  if (!clientSecret) {
    return (
      <main className="min-h-screen bg-neutral-50 p-6 flex items-center justify-center">
        <p className="text-neutral-500">Loading…</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-neutral-50 p-6">
      <div className="mx-auto max-w-md">
        <h1 className="text-lg font-semibold text-neutral-900 mb-2">Pay your deposit</h1>
        <p className="text-sm text-neutral-600 mb-6">Full refund if you cancel 48+ hours before your reservation.</p>
        <Elements stripe={getStripe()} options={{ clientSecret, appearance: { theme: 'stripe' } }}>
          <PayForm clientSecret={clientSecret} onSuccess={onSuccess} />
        </Elements>
      </div>
    </main>
  );
}

export default function PayPage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-neutral-50 p-6 flex items-center justify-center"><p className="text-neutral-500">Loading…</p></main>}>
      <PayContent />
    </Suspense>
  );
}
