'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { DiningDurationTab } from '@/app/dashboard/availability/DiningDurationTab';
import { useRestaurantOnboardingAvailability } from '@/hooks/use-restaurant-onboarding-availability';

interface Props {
  onDone: () => Promise<void>;
}

export function DiningDurationStep({ onDone }: Props) {
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
        <h2 className="mb-1 text-lg font-bold text-slate-900">How long does each party stay?</h2>
        <p className="mb-6 text-sm text-slate-500">
          Dining duration decides how long a table is held for each booking, and therefore how soon you can
          seat the next guest.
        </p>
        <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-6 text-center text-sm text-slate-600">
          <p className="font-medium text-slate-700">No services yet</p>
          <p className="mt-1">
            Go back and add at least one dining service first. You can also configure this later from{' '}
            <Link href="/dashboard/availability?tab=duration" className="font-medium text-brand-600 underline">
              Availability → Dining Duration
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
      <h2 className="mb-1 text-lg font-bold text-slate-900">How long does each party stay?</h2>
      <p className="mb-3 text-sm text-slate-500">
        Duration is set per party size, per service. Larger parties usually stay longer, and dinner typically
        runs longer than lunch. These numbers affect when the next guest can be offered the same table.
      </p>

      <div className="mb-6 rounded-xl border border-slate-200 bg-slate-50/80 p-4 text-sm text-slate-600">
        <p className="mb-2 font-medium text-slate-800">A good starting point</p>
        <ul className="list-inside list-disc space-y-1">
          <li>Lunch: 1–2 guests 75 min · 3–4 guests 90 min · 5+ guests 120 min.</li>
          <li>Dinner: 1–2 guests 90 min · 3–4 guests 120 min · 5+ guests 150 min.</li>
          <li>Fine dining: add 15–30 minutes to each band.</li>
        </ul>
        <p className="mt-2 text-xs text-slate-500">
          Tip: you can add day-of-week overrides (e.g. give Sunday 30 extra minutes) later from{' '}
          <Link href="/dashboard/availability?tab=duration" className="font-medium text-brand-600 underline">
            Availability → Dining Duration
          </Link>
          .
        </p>
      </div>

      <DiningDurationTab services={services} showToast={showToast} selectedAreaId={selectedAreaId} />

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
