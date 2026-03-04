'use client';

import { useCallback, useEffect, useState } from 'react';

interface StripeConnectSectionProps {
  stripeAccountId: string | null;
  isAdmin: boolean;
}

interface StripeStatus {
  connected: true;
  charges_enabled: boolean;
  details_submitted: boolean;
}

type ViewState =
  | { kind: 'loading' }
  | { kind: 'not_connected' }
  | { kind: 'incomplete'; accountId: string }
  | { kind: 'active'; accountId: string }
  | { kind: 'error'; message: string };

export function StripeConnectSection({ stripeAccountId, isAdmin }: StripeConnectSectionProps) {
  const [state, setState] = useState<ViewState>(
    stripeAccountId ? { kind: 'loading' } : { kind: 'not_connected' },
  );
  const [redirecting, setRedirecting] = useState(false);

  useEffect(() => {
    if (!stripeAccountId) return;

    let cancelled = false;

    async function fetchStatus() {
      try {
        const res = await fetch('/api/venue/stripe-connect');
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          if (!cancelled) setState({ kind: 'error', message: body.error ?? 'Failed to load status' });
          return;
        }
        const data: StripeStatus = await res.json();
        if (cancelled) return;

        if (data.charges_enabled && data.details_submitted) {
          setState({ kind: 'active', accountId: stripeAccountId! });
        } else {
          setState({ kind: 'incomplete', accountId: stripeAccountId! });
        }
      } catch {
        if (!cancelled) setState({ kind: 'error', message: 'Failed to check Stripe status' });
      }
    }

    fetchStatus();
    return () => { cancelled = true; };
  }, [stripeAccountId]);

  const startOnboarding = useCallback(async () => {
    setRedirecting(true);
    try {
      const res = await fetch('/api/venue/stripe-connect', { method: 'POST' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setState({ kind: 'error', message: body.error ?? 'Failed to start onboarding' });
        setRedirecting(false);
        return;
      }
      const { url } = await res.json();
      window.location.href = url;
    } catch {
      setState({ kind: 'error', message: 'Network error — please try again' });
      setRedirecting(false);
    }
  }, []);

  return (
    <section className="rounded-lg border border-neutral-200 bg-white p-6 shadow-sm">
      <h2 className="mb-4 text-lg font-semibold text-neutral-900">Stripe payments</h2>

      {state.kind === 'loading' && (
        <div className="animate-pulse space-y-2">
          <div className="h-4 w-48 rounded bg-neutral-200" />
          <div className="h-4 w-32 rounded bg-neutral-200" />
        </div>
      )}

      {state.kind === 'not_connected' && (
        <div>
          <p className="text-sm text-neutral-600 mb-3">
            Connect your Stripe account to start accepting guest deposits directly into your bank account.
          </p>
          {isAdmin ? (
            <button
              onClick={startOnboarding}
              disabled={redirecting}
              className="rounded bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
            >
              {redirecting ? 'Redirecting…' : 'Connect Stripe'}
            </button>
          ) : (
            <p className="text-sm text-neutral-500">Ask an admin to connect Stripe.</p>
          )}
        </div>
      )}

      {state.kind === 'incomplete' && (
        <div>
          <div className="mb-3 flex items-start gap-2 rounded border border-amber-200 bg-amber-50 p-3">
            <svg className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
            </svg>
            <div>
              <p className="text-sm font-medium text-amber-800">Stripe setup incomplete</p>
              <p className="text-sm text-amber-700">Complete your Stripe onboarding to start accepting deposits.</p>
            </div>
          </div>
          {isAdmin ? (
            <button
              onClick={startOnboarding}
              disabled={redirecting}
              className="rounded bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
            >
              {redirecting ? 'Redirecting…' : 'Complete Stripe setup'}
            </button>
          ) : (
            <p className="text-sm text-neutral-500">Ask an admin to complete Stripe setup.</p>
          )}
          <p className="mt-2 text-xs text-neutral-400">Account: {state.accountId}</p>
        </div>
      )}

      {state.kind === 'active' && (
        <div>
          <div className="flex items-center gap-2">
            <svg className="h-5 w-5 text-green-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
            </svg>
            <span className="text-sm font-medium text-green-700">Stripe connected — charges enabled</span>
          </div>
          <p className="mt-2 text-xs text-neutral-400">Account: {state.accountId}</p>
        </div>
      )}

      {state.kind === 'error' && (
        <div>
          <div className="mb-3 rounded border border-red-200 bg-red-50 p-3">
            <p className="text-sm text-red-700">{state.message}</p>
          </div>
          <button
            onClick={() => window.location.reload()}
            className="rounded bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
          >
            Retry
          </button>
        </div>
      )}
    </section>
  );
}
