'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { ServicesTab } from '@/app/dashboard/availability/ServicesTab';
import { useRestaurantOnboardingAvailability } from '@/hooks/use-restaurant-onboarding-availability';

interface Props {
  onDone: () => Promise<void>;
}

export function ServicesStep({ onDone }: Props) {
  const { selectedAreaId, services, setServices, loading } = useRestaurantOnboardingAvailability();
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

  return (
    <div>
      <h2 className="mb-1 text-lg font-bold text-slate-900">Dining services</h2>
      <p className="mb-4 text-sm text-slate-500">
        Use the same service editor as{' '}
        <Link
          href="/dashboard/availability?tab=services"
          className="font-medium text-brand-600 underline hover:text-brand-700"
        >
          Availability → Services
        </Link>
        . Edits save immediately.
      </p>

      <ServicesTab services={services} setServices={setServices} showToast={showToast} areaId={selectedAreaId} />

      <div className="mt-8 flex items-center justify-between">
        <button
          type="button"
          onClick={() => void onDone()}
          className="text-sm text-slate-500 hover:text-slate-700"
        >
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
