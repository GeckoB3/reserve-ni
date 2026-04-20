'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { CapacityRulesTab } from '@/app/dashboard/availability/CapacityRulesTab';
import { useRestaurantOnboardingAvailability } from '@/hooks/use-restaurant-onboarding-availability';

interface Props {
  onDone: () => Promise<void>;
}

export function CapacityStep({ onDone }: Props) {
  const { selectedAreaId, services, loading } = useRestaurantOnboardingAvailability();
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
        <h2 className="mb-1 text-lg font-bold text-slate-900">Capacity rules</h2>
        <p className="mb-6 text-sm text-slate-500">
          Capacity rules control covers and bookings for each service&apos;s time slots.
        </p>
        <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-6 text-center text-sm text-slate-600">
          <p className="font-medium text-slate-700">No services yet</p>
          <p className="mt-1">
            Add dining services first, then configure capacity under{' '}
            <Link href="/dashboard/availability?tab=capacity" className="font-medium text-brand-600 underline">
              Availability → Capacity Rules
            </Link>
            .
          </p>
        </div>
        <div className="mt-8 flex justify-end">
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
      <h2 className="mb-1 text-lg font-bold text-slate-900">Capacity rules</h2>
      <p className="mb-4 text-sm text-slate-500">
        Same tools as{' '}
        <Link
          href="/dashboard/availability?tab=capacity"
          className="font-medium text-brand-600 underline hover:text-brand-700"
        >
          Availability → Capacity Rules
        </Link>
        : defaults and optional day or time overrides per service.
      </p>

      <CapacityRulesTab services={services} showToast={showToast} selectedAreaId={selectedAreaId} />

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
