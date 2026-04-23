'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { FloorPlanEditor } from '@/app/dashboard/settings/floor-plan/FloorPlanEditor';
import { TableList } from '@/app/dashboard/settings/tables/TableList';
import { TableCombinationsPage } from '@/app/dashboard/settings/tables/TableCombinationsPage';
import type { TableCombination, VenueTable } from '@/types/table-management';
import { SectionCard } from '@/components/ui/dashboard/SectionCard';
import { TabBar } from '@/components/ui/dashboard/TabBar';

export type FloorPlanEditorTabKey = 'layout' | 'tables' | 'combinations';

interface Props {
  isAdmin: boolean;
  activeTab: FloorPlanEditorTabKey;
  onTabChange: (tab: FloorPlanEditorTabKey) => void;
  /** When false, only the Tables tab is shown (simple covers mode). */
  advancedTableManagement: boolean;
  /** Hide the built-in section title and intro (e.g. when the parent screen already has a heading). */
  hideHeading?: boolean;
  /** Called after each successful layout auto-save so siblings can react. */
  onLayoutSaved?: () => void;
  /** When the venue saves a new Combination Detection Distance, pass it so the combinations catalog refreshes. */
  combinationThreshold?: number;
  /** Incremented when the floor plan layout auto-saves; refreshes adjacency preview on the Combinations tab. */
  layoutSaveCount?: number;
  /** Keeps parent venue state in sync after saving combination detection distance on the Combinations tab. */
  onCombinationThresholdSaved?: (value: number) => void;
  /** When set, load tables and combinations for this dining area only. */
  diningAreaId?: string | null;
}

export function FloorPlanEditorTabs({
  isAdmin,
  activeTab,
  onTabChange,
  advancedTableManagement,
  hideHeading = false,
  onLayoutSaved,
  combinationThreshold,
  layoutSaveCount = 0,
  onCombinationThresholdSaved,
  diningAreaId,
}: Props) {
  const [tables, setTables] = useState<VenueTable[]>([]);
  const [combinations, setCombinations] = useState<TableCombination[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchManagementData = useCallback(async (options?: { silent?: boolean }) => {
    const showSpinner = !options?.silent;
    if (showSpinner) setLoading(true);
    try {
      const areaQs = diningAreaId ? `?area_id=${encodeURIComponent(diningAreaId)}` : '';
      const tablesRes = await fetch(`/api/venue/tables${areaQs}`);
      if (tablesRes.ok) {
        const data = await tablesRes.json();
        setTables(data.tables ?? []);
      }
      if (advancedTableManagement) {
        const combosRes = await fetch(`/api/venue/tables/combinations${areaQs}`);
        if (combosRes.ok) {
          const data = await combosRes.json();
          setCombinations(data.combinations ?? []);
        }
      } else {
        setCombinations([]);
      }
    } finally {
      if (showSpinner) setLoading(false);
    }
  }, [advancedTableManagement, diningAreaId]);

  /** Keep Tables / Combinations list data in sync after Layout auto-save (positions, dimensions, seats). */
  const handleLayoutSaved = useCallback(() => {
    void fetchManagementData({ silent: true });
    onLayoutSaved?.();
  }, [fetchManagementData, onLayoutSaved]);

  useEffect(() => {
    void fetchManagementData();
  }, [fetchManagementData]);

  const tabLabel = useMemo(() => {
    if (activeTab === 'layout') return 'Layout';
    if (activeTab === 'tables') return 'Tables';
    return 'Combinations';
  }, [activeTab]);

  const visibleTabKeys = useMemo((): FloorPlanEditorTabKey[] => {
    if (advancedTableManagement) {
      return ['layout', 'tables', 'combinations'];
    }
    return ['tables'];
  }, [advancedTableManagement]);

  return (
    <SectionCard>
      {!hideHeading ? (
        <SectionCard.Header
          title="Floor plan & tables"
          description={
            advancedTableManagement
              ? 'Layout changes are saved automatically as you make them.'
              : 'Optional: define tables for staff seating notes on the Day Sheet. This does not change how many guests can book online.'
          }
        />
      ) : null}

      <SectionCard.Body className={hideHeading ? '!pt-5' : '!pt-0'}>
      <div className="mb-4 overflow-x-auto pb-1">
        <TabBar<FloorPlanEditorTabKey>
          tabs={visibleTabKeys.map((k) => ({
            id: k,
            label: k[0]!.toUpperCase() + k.slice(1),
          }))}
          value={activeTab}
          onChange={onTabChange}
        />
      </div>

      <div className="rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{tabLabel}</p>
      </div>

      <div className="mt-4">
        {activeTab === 'layout' && advancedTableManagement && (
          <FloorPlanEditor embedded onLayoutSaved={handleLayoutSaved} diningAreaId={diningAreaId} />
        )}

        {activeTab === 'tables' && (
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            {loading ? (
              <div className="flex items-center justify-center py-10">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-brand-600" />
              </div>
            ) : (
              <TableList
                tables={tables}
                setTables={setTables}
                isAdmin={isAdmin}
                onRefresh={fetchManagementData}
                variant={advancedTableManagement ? 'full' : 'covers'}
                diningAreaId={diningAreaId}
              />
            )}
          </div>
        )}

        {activeTab === 'combinations' && advancedTableManagement && (
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            {loading ? (
              <div className="flex items-center justify-center py-10">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-brand-600" />
              </div>
            ) : (
              <TableCombinationsPage
                combinations={combinations}
                setCombinations={setCombinations}
                tables={tables}
                isAdmin={isAdmin}
                onRefresh={fetchManagementData}
                combinationThreshold={combinationThreshold}
                layoutSaveCount={layoutSaveCount}
                onCombinationThresholdSaved={onCombinationThresholdSaved}
                diningAreaId={diningAreaId}
              />
            )}
          </div>
        )}
      </div>
      </SectionCard.Body>
    </SectionCard>
  );
}
