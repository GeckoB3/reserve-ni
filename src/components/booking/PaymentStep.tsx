'use client';

import { useState } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { getStripe } from '@/lib/stripe-client';

interface PaymentStepProps {
  clientSecret: string;
  amountPence: number;
  partySize: number;
  onComplete: () => void;
  onBack: () => void;
  cancellationPolicy?: string;
}

function PaymentForm({ clientSecret, onComplete, onBack }: { clientSecret: string; onComplete: () => void; onBack: () => void }) {
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
        setLoading(false);
        return;
      }
      onComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Payment failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="mt-6 space-y-4">
      <PaymentElement />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-3 pt-2">
        <button type="button" onClick={onBack} className="text-sm text-neutral-600 underline">
          ← Back
        </button>
        <button type="submit" disabled={!stripe || loading} className="rounded bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50">
          {loading ? 'Processing…' : 'Pay deposit'}
        </button>
      </div>
    </form>
  );
}

export function PaymentStep({ clientSecret, amountPence, partySize, onComplete, onBack, cancellationPolicy }: PaymentStepProps) {
  const amount = (amountPence / 100).toFixed(2);

  return (
    <div className="mt-6">
      <p className="text-sm text-neutral-600">
        Deposit: £{amount} ({partySize} × £{(amountPence / 100 / partySize).toFixed(2)} per person)
      </p>
      {cancellationPolicy && (
        <p className="mt-2 rounded border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          {cancellationPolicy}
        </p>
      )}
      <Elements
        stripe={getStripe()}
        options={{
          clientSecret,
          appearance: { theme: 'stripe' },
        }}
      >
        <PaymentForm clientSecret={clientSecret} onComplete={onComplete} onBack={onBack} />
      </Elements>
    </div>
  );
}
