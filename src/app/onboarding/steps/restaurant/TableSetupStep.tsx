'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { FloorPlanEditorTabs, type FloorPlanEditorTabKey } from '@/app/dashboard/availability/FloorPlanEditorTabs';
import { useRestaurantOnboardingAvailability } from '@/hooks/use-restaurant-onboarding-availability';

interface Props {
  onDone: () => Promise<void>;
}

export function TableSetupStep({ onDone }: Props) {
  const { selectedAreaId, loading: areaLoading } = useRestaurantOnboardingAvailability();
  const [floorTab, setFloorTab] = useState<FloorPlanEditorTabKey>('layout');
  const [layoutSaveCount, setLayoutSaveCount] = useState(0);
  const [combinationThreshold, setCombinationThreshold] = useState(80);
  const [settingsLoading, setSettingsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch('/api/venue/tables/settings');
        if (res.ok && !cancelled) {
          const data = (await res.json()) as {
            settings?: { combination_threshold?: number };
          };
          const ct = data.settings?.combination_threshold;
          if (typeof ct === 'number') setCombinationThreshold(ct);
        }
      } finally {
        if (!cancelled) setSettingsLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const onLayoutSaved = useCallback(() => {
    setLayoutSaveCount((n) => n + 1);
  }, []);

  if (areaLoading || settingsLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div>
      <h2 className="mb-1 text-lg font-bold text-slate-900">Set up your tables</h2>
      <p className="mb-2 text-sm text-slate-500">
        You chose Advanced table management. Use the same floor plan tools as{' '}
        <Link
          href="/dashboard/availability?tab=table&fp=layout"
          className="font-medium text-brand-600 underline hover:text-brand-700"
        >
          Availability → Table Management
        </Link>
        . Layout saves as you work. You can also open the floor plan in a new tab anytime from the dashboard.
      </p>
      <p className="mb-4 text-xs text-slate-500">
        If you are short on time, continue now and finish layout later from Availability.
      </p>

      <FloorPlanEditorTabs
        isAdmin
        activeTab={floorTab}
        onTabChange={setFloorTab}
        advancedTableManagement
        hideHeading
        onLayoutSaved={onLayoutSaved}
        combinationThreshold={combinationThreshold}
        layoutSaveCount={layoutSaveCount}
        onCombinationThresholdSaved={setCombinationThreshold}
        diningAreaId={selectedAreaId}
      />

      <div className="mt-8 flex items-center justify-between">
        <button
          type="button"
          onClick={() => void onDone()}
          className="text-sm text-slate-500 hover:text-slate-700"
        >
          Skip for now
        </button>
        <div className="flex items-center gap-3">
          <a
            href="/dashboard/floor-plan"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-medium text-brand-600 hover:text-brand-700"
          >
            Open floor plan in new tab ↗
          </a>
          <button
            type="button"
            onClick={() => void onDone()}
            className="rounded-lg bg-brand-600 px-6 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}
