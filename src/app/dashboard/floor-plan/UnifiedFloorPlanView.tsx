'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { FloorPlanLiveView } from './FloorPlanLiveView';
import { FloorPlanEditor } from '@/app/dashboard/settings/floor-plan/FloorPlanEditor';
import { TableList } from '@/app/dashboard/settings/tables/TableList';
import { CombinationList } from '@/app/dashboard/settings/tables/CombinationList';
import type { TableCombination, VenueTable } from '@/types/table-management';
import type { BookingModel } from '@/types/booking-models';

type EditTab = 'layout' | 'tables' | 'combinations' | 'areas';

export function UnifiedFloorPlanView({
  isAdmin,
  venueId,
  currency,
  bookingModel = 'table_reservation',
  enabledModels = [],
}: {
  isAdmin: boolean;
  venueId: string;
  currency?: string;
  bookingModel?: BookingModel;
  enabledModels?: BookingModel[];
}) {
  const [mode, setMode] = useState<'operational' | 'edit'>('operational');
  const [tab, setTab] = useState<EditTab>('layout');
  const [tables, setTables] = useState<VenueTable[]>([]);
  const [combinations, setCombinations] = useState<TableCombination[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchManagementData = useCallback(async () => {
    setLoading(true);
    try {
      const [tablesRes, combosRes] = await Promise.all([
        fetch('/api/venue/tables'),
        fetch('/api/venue/tables/combinations'),
      ]);
      if (tablesRes.ok) {
        const data = await tablesRes.json();
        setTables(data.tables ?? []);
      }
      if (combosRes.ok) {
        const data = await combosRes.json();
        setCombinations(data.combinations ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (mode === 'edit') {
      fetchManagementData();
    }
  }, [mode, fetchManagementData]);

  const tabLabel = useMemo(() => {
    if (tab === 'layout') return 'Layout';
    if (tab === 'tables') return 'Tables';
    if (tab === 'combinations') return 'Combinations';
    return 'Areas';
  }, [tab]);

  if (mode === 'operational') {
    return (
      <div className="space-y-2 sm:space-y-3">
        <div className="flex items-center justify-end">
          {isAdmin && (
            <button
              type="button"
              onClick={() => setMode('edit')}
              className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-amber-600 sm:px-3 sm:py-2 sm:text-sm"
            >
              Edit Layout
            </button>
          )}
        </div>
        <FloorPlanLiveView
          isAdmin={isAdmin}
          venueId={venueId}
          currency={currency}
          bookingModel={bookingModel}
          enabledModels={enabledModels}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        Editing Layout - changes are saved automatically as you make them.
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="overflow-x-auto">
          <div className="flex w-max gap-2">
            {(['layout', 'tables', 'combinations', 'areas'] as EditTab[]).map((nextTab) => (
              <button
                key={nextTab}
                type="button"
                onClick={() => setTab(nextTab)}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                  tab === nextTab
                    ? 'bg-brand-600 text-white'
                    : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                {nextTab[0]!.toUpperCase() + nextTab.slice(1)}
              </button>
            ))}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setMode('operational')}
          className="self-start rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 sm:self-auto"
        >
          Back to Operational View
        </button>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{tabLabel}</p>
      </div>

      {tab === 'layout' && <FloorPlanEditor embedded />}

      {tab === 'tables' && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-brand-600" />
            </div>
          ) : (
            <TableList tables={tables} setTables={setTables} isAdmin={isAdmin} onRefresh={fetchManagementData} />
          )}
        </div>
      )}

      {tab === 'combinations' && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-brand-600" />
            </div>
          ) : (
            <CombinationList
              combinations={combinations}
              setCombinations={setCombinations}
              tables={tables}
              isAdmin={isAdmin}
              onRefresh={fetchManagementData}
            />
          )}
        </div>
      )}

      {tab === 'areas' && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-6 py-10 text-center">
          <h3 className="text-sm font-semibold text-slate-700">Areas</h3>
          <p className="mt-2 text-sm text-slate-500">Coming soon.</p>
        </div>
      )}
    </div>
  );
}
