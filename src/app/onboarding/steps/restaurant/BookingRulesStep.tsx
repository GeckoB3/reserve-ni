'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { BookingRulesTab } from '@/app/dashboard/availability/BookingRulesTab';
import { useRestaurantOnboardingAvailability } from '@/hooks/use-restaurant-onboarding-availability';

interface Props {
  onDone: () => Promise<void>;
}

export function BookingRulesStep({ onDone }: Props) {
  const { selectedAreaId, activeAreas, selectArea, services, loading } =
    useRestaurantOnboardingAvailability();
  const [toast, setToast] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
      </div>
    );
  }

  if (services.length === 0) {
    return (
      <div>
        <h2 className="mb-1 text-lg font-bold text-slate-900">Booking rules & deposits</h2>
        <p className="mb-6 text-sm text-slate-500">
          Advance notice, party size limits, deposits, cancellation windows: the guardrails for online booking.
        </p>
        <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-6 text-center text-sm text-slate-600">
          <p className="font-medium text-slate-700">No services yet</p>
          <p className="mt-1">
            Go back and add at least one dining service first. You can also configure rules later from{' '}
            <Link href="/dashboard/availability?tab=rules" className="font-medium text-brand-600 underline">
              Availability → Booking Rules
            </Link>
            .
          </p>
        </div>
        <div className="mt-8 flex items-center justify-between">
          <button type="button" onClick={() => void onDone()} className="text-sm text-slate-500 hover:text-slate-700">
            Skip for now
          </button>
          <button
            type="button"
            onClick={() => void onDone()}
            className="rounded-lg bg-brand-600 px-6 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            Continue
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h2 className="mb-1 text-lg font-bold text-slate-900">Booking rules & deposits</h2>
      <p className="mb-3 text-sm text-slate-500">
        Set per-service guardrails for online booking. These protect your service: how far ahead guests can
        book, how big a party you allow, whether you&apos;ll take a deposit, and how late guests can cancel.
      </p>

      <div className="mb-6 rounded-xl border border-slate-200 bg-slate-50/80 p-4 text-sm text-slate-600">
        <p className="mb-2 font-medium text-slate-800">What each field means</p>
        <ul className="list-inside list-disc space-y-1">
          <li><strong className="font-medium">Advance notice</strong>: the earliest a guest can book before arrival (e.g. 60 min).</li>
          <li><strong className="font-medium">Maximum advance</strong>: how many days ahead bookings are open (e.g. 60 days).</li>
          <li><strong className="font-medium">Party sizes online</strong>: smallest and largest party guests can book online without calling.</li>
          <li><strong className="font-medium">Large-party message</strong>: custom text shown to anyone over the online limit (typically &quot;Please call us&quot;).</li>
          <li><strong className="font-medium">Deposit threshold</strong>: party size at which a deposit becomes required.</li>
          <li><strong className="font-medium">Cancellation notice</strong>: hours before arrival that a guest must cancel to get a refund.</li>
        </ul>
        <p className="mt-2 text-xs text-slate-500">
          Deposits need Stripe. You&apos;ll connect Stripe later in this flow, then come back and enable deposits
          once it&apos;s connected.
        </p>
      </div>

      {activeAreas.length > 1 && selectedAreaId && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          <span className="text-sm font-medium text-slate-600">Dining area</span>
          <div className="flex flex-wrap gap-2">
            {activeAreas.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => void selectArea(a.id)}
                className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm transition-colors ${
                  selectedAreaId === a.id
                    ? 'border-brand-600 bg-brand-50 text-brand-900'
                    : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100/80'
                }`}
              >
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: a.colour || '#6366F1' }}
                />
                {a.name}
              </button>
            ))}
          </div>
        </div>
      )}

      <BookingRulesTab services={services} showToast={showToast} selectedAreaId={selectedAreaId} />

      <div className="mt-8 flex items-center justify-between">
        <button type="button" onClick={() => void onDone()} className="text-sm text-slate-500 hover:text-slate-700">
          Skip for now
        </button>
        <button
          type="button"
          onClick={() => void onDone()}
          className="rounded-lg bg-brand-600 px-6 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          Continue
        </button>
      </div>

      {toast && (
        <div className="fixed bottom-6 right-6 z-50 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
