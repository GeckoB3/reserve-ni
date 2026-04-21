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
        <h2 className="mb-1 text-lg font-bold text-slate-900">How many guests at once?</h2>
        <p className="mb-6 text-sm text-slate-500">
          Capacity rules control how many guests and bookings you&apos;ll accept in each time slot.
        </p>
        <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-6 text-center text-sm text-slate-600">
          <p className="font-medium text-slate-700">No services yet</p>
          <p className="mt-1">
            Go back and add at least one dining service first; capacity is configured per service. You can
            always come back here from{' '}
            <Link href="/dashboard/availability?tab=capacity" className="font-medium text-brand-600 underline">
              Availability → Capacity Rules
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
      <h2 className="mb-1 text-lg font-bold text-slate-900">How many guests at once?</h2>
      <p className="mb-3 text-sm text-slate-500">
        Capacity rules cap how busy each time slot can get. Set a reasonable default per service, and you can
        also add day or time-of-day overrides (e.g. a smaller kitchen capacity on Sunday).
      </p>

      <div className="mb-6 rounded-xl border border-slate-200 bg-slate-50/80 p-4 text-sm text-slate-600">
        <p className="mb-2 font-medium text-slate-800">The three numbers you&apos;ll see</p>
        <ul className="list-inside list-disc space-y-1">
          <li><strong className="font-medium">Max covers per slot</strong>: total guests arriving in one time slot. Think kitchen capacity.</li>
          <li><strong className="font-medium">Max bookings per slot</strong>: total reservations arriving at once. Helps pace the host stand.</li>
          <li><strong className="font-medium">Slot interval</strong>: how often a new arrival time is offered (e.g. every 15 minutes).</li>
        </ul>
        <p className="mt-2 text-xs text-slate-500">
          Example: 30 covers / 10 bookings every 15 minutes means guests see 12:00, 12:15, 12:30… and each of
          those times can take up to 10 parties or 30 people total.
        </p>
      </div>

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
