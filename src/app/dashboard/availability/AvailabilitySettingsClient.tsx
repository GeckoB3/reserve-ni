'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ServicesTab } from './ServicesTab';
import { CapacityRulesTab } from './CapacityRulesTab';
import { DiningDurationTab } from './DiningDurationTab';
import { BookingRulesTab } from './BookingRulesTab';
import { TableManagementSection } from '@/app/dashboard/settings/sections/TableManagementSection';
import { FloorPlanEditorTabs, type FloorPlanEditorTabKey } from './FloorPlanEditorTabs';
import { AvailabilityConfigSection } from '@/app/dashboard/settings/sections/AvailabilityConfigSection';
import type { VenueSettings } from '@/app/dashboard/settings/types';
import { isRestaurantTableProductTier } from '@/lib/tier-enforcement';

const BASE_TABS = [
  { key: 'services' as const, label: 'Services' },
  { key: 'capacity' as const, label: 'Capacity Rules' },
  { key: 'duration' as const, label: 'Dining Duration' },
  { key: 'rules' as const, label: 'Booking Rules' },
];

const TABLE_TAB = { key: 'table' as const, label: 'Table Management' };

type TabKey = (typeof BASE_TABS)[number]['key'] | typeof TABLE_TAB.key;

interface Service {
  id: string;
  name: string;
  days_of_week: number[];
  start_time: string;
  end_time: string;
  last_booking_time: string;
  is_active: boolean;
  sort_order: number;
}

function resolveInitialActiveTab(
  initialTab: TabKey | undefined,
  venue: VenueSettings | null,
): TabKey {
  if (!venue) return 'services';
  const showTable = isRestaurantTableProductTier(venue.pricing_tier);
  if (initialTab === 'table' && !showTable) return 'services';
  if (initialTab === 'table' && showTable) return 'table';
  if (initialTab && initialTab !== 'table') return initialTab;
  return 'services';
}

const VALID_FLOOR_PLAN_TABS: FloorPlanEditorTabKey[] = ['layout', 'tables', 'combinations', 'areas'];

interface Props {
  initialVenue: VenueSettings | null;
  hasServiceConfig: boolean;
  initialTab?: TabKey;
  initialFloorPlanTab?: FloorPlanEditorTabKey;
}

export default function AvailabilitySettingsClient({
  initialVenue,
  hasServiceConfig,
  initialTab,
  initialFloorPlanTab,
}: Props) {
  const router = useRouter();
  const [venue, setVenue] = useState<VenueSettings | null>(initialVenue);
  const [activeTab, setActiveTabState] = useState<TabKey>(() =>
    resolveInitialActiveTab(initialTab, initialVenue),
  );
  const [floorPlanTab, setFloorPlanTabState] = useState<FloorPlanEditorTabKey>(() => {
    const resolved =
      initialFloorPlanTab && VALID_FLOOR_PLAN_TABS.includes(initialFloorPlanTab) ? initialFloorPlanTab : 'layout';
    if (initialVenue && !initialVenue.table_management_enabled && resolved !== 'tables') {
      return 'tables';
    }
    return resolved;
  });
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  // Incremented each time the floor plan editor successfully auto-saves positions.
  // Passed to TableManagementSection so it can refresh the adjacency diagram and
  // re-run the recalculate API automatically.
  const [layoutSaveCount, setLayoutSaveCount] = useState(0);
  const handleLayoutSaved = useCallback(() => setLayoutSaveCount((n) => n + 1), []);

  useEffect(() => {
    setVenue(initialVenue);
  }, [initialVenue]);

  useEffect(() => {
    if (initialFloorPlanTab && VALID_FLOOR_PLAN_TABS.includes(initialFloorPlanTab)) {
      const next =
        venue && !venue.table_management_enabled && initialFloorPlanTab !== 'tables'
          ? 'tables'
          : initialFloorPlanTab;
      setFloorPlanTabState(next);
    }
  }, [initialFloorPlanTab, venue]);

  const showTableTab = Boolean(venue && isRestaurantTableProductTier(venue.pricing_tier));

  const visibleTabs = useMemo(() => {
    if (showTableTab) return [...BASE_TABS, TABLE_TAB];
    return [...BASE_TABS];
  }, [showTableTab]);

  useEffect(() => {
    if (activeTab === 'table' && !showTableTab) {
      setActiveTabState('services');
      router.replace('/dashboard/availability?tab=services', { scroll: false });
    }
  }, [activeTab, showTableTab, router]);

  const setActiveTab = useCallback(
    (key: TabKey) => {
      setActiveTabState(key);
      if (key === 'table') {
        router.replace(`/dashboard/availability?tab=table&fp=${floorPlanTab}`, { scroll: false });
      } else {
        router.replace(`/dashboard/availability?tab=${key}`, { scroll: false });
      }
    },
    [router, floorPlanTab],
  );

  const setFloorPlanTab = useCallback(
    (key: FloorPlanEditorTabKey) => {
      setFloorPlanTabState(key);
      router.replace(`/dashboard/availability?tab=table&fp=${key}`, { scroll: false });
    },
    [router],
  );

  const onUpdate = useCallback((patch: Partial<VenueSettings>) => {
    setVenue((v) => (v ? { ...v, ...patch } : null));
  }, []);

  const showToast = useCallback((message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 3000);
  }, []);

  useEffect(() => {
    if (venue && !venue.table_management_enabled && floorPlanTab !== 'tables') {
      setFloorPlanTabState('tables');
      router.replace('/dashboard/availability?tab=table&fp=tables', { scroll: false });
    }
  }, [venue, floorPlanTab, router]);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/venue/services');
        if (res.ok) {
          const data = await res.json();
          setServices(data.services ?? []);
        }
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (!venue && !loading) {
    return (
      <div className="p-6 lg:p-8">
        <p className="text-sm text-red-600">Could not load venue settings. Try again or contact support.</p>
      </div>
    );
  }

  if (loading || !venue) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="mb-1 text-xl font-bold text-slate-900">Availability Settings</h1>
          <p className="text-sm text-slate-500">
            Manage services, capacity, dining durations, booking rules, and table management. Venue-wide closures, amended
            hours, and capacity blocks are under{' '}
            <Link
              href="/dashboard/settings?tab=business-hours"
              className="font-medium text-brand-600 hover:text-brand-700 underline"
            >
              Settings → Business Hours
            </Link>
            .
          </p>
        </div>
        <Link
          href="/dashboard/onboarding"
          className="flex-shrink-0 rounded-lg border border-brand-200 bg-brand-50 px-4 py-2 text-sm font-medium text-brand-700 hover:bg-brand-100 transition-colors"
        >
          Setup Wizard
        </Link>
      </div>

      <div className="mb-6 flex gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-slate-100 p-1">
        {visibleTabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium transition-all ${
              activeTab === tab.key ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'services' && (
        <ServicesTab services={services} setServices={setServices} showToast={showToast} />
      )}
      {activeTab === 'capacity' && <CapacityRulesTab services={services} showToast={showToast} />}
      {activeTab === 'duration' && <DiningDurationTab services={services} showToast={showToast} />}
      {activeTab === 'rules' && <BookingRulesTab services={services} showToast={showToast} />}
      {activeTab === 'table' && showTableTab && (
        <div className="space-y-6">
          <TableManagementSection venue={venue} onUpdate={onUpdate} isAdmin layoutSaveCount={layoutSaveCount} />
          <FloorPlanEditorTabs
            isAdmin
            activeTab={floorPlanTab}
            onTabChange={setFloorPlanTab}
            advancedTableManagement={Boolean(venue.table_management_enabled)}
            onLayoutSaved={handleLayoutSaved}
            combinationThreshold={venue.combination_threshold ?? 80}
          />
          {!hasServiceConfig && (
            <AvailabilityConfigSection venue={venue} onUpdate={onUpdate} isAdmin />
          )}
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 right-6 z-50 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
