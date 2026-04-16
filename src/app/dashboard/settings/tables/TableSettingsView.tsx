'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { VenueTable, TableCombination } from '@/types/table-management';
import { TableList } from './TableList';
import { TableCombinationsPage } from './TableCombinationsPage';
import { StatusSettings } from './StatusSettings';
import { SetupWizard } from './SetupWizard';

interface TableSettings {
  table_management_enabled: boolean;
  floor_plan_background_url: string | null;
  auto_bussing_minutes: number;
  active_table_statuses: string[];
  /** Combination Detection Distance (px); drives auto-detected combination groups. */
  combination_threshold?: number;
}

interface Props {
  isAdmin: boolean;
}

export function TableSettingsView({ isAdmin }: Props) {
  const router = useRouter();
  const [tables, setTables] = useState<VenueTable[]>([]);
  const [combinations, setCombinations] = useState<TableCombination[]>([]);
  const [settings, setSettings] = useState<TableSettings>({
    table_management_enabled: false,
    floor_plan_background_url: null,
    auto_bussing_minutes: 10,
    active_table_statuses: ['available', 'reserved', 'seated', 'starters', 'mains', 'dessert', 'bill', 'paid', 'bussing'],
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showWizard, setShowWizard] = useState(false);
  const [activeTab, setActiveTab] = useState<'tables' | 'combinations' | 'statuses'>('tables');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [tablesRes, combosRes] = await Promise.all([
        fetch('/api/venue/tables'),
        fetch('/api/venue/tables/combinations'),
      ]);

      if (tablesRes.ok) {
        const data = await tablesRes.json();
        setTables(data.tables ?? []);
        setSettings((prev) => data.settings ?? prev);
      }

      if (combosRes.ok) {
        const data = await combosRes.json();
        setCombinations(data.combinations ?? []);
      }
    } catch (err) {
      console.error('Failed to load table data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const toggleEnabled = async () => {
    if (!isAdmin) return;

    const newValue = !settings.table_management_enabled;

    if (newValue && tables.length === 0) {
      setShowWizard(true);
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/venue/tables/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table_management_enabled: newValue }),
      });
      if (res.ok) {
        const data = await res.json();
        setSettings(data.settings);
        router.refresh();
      }
    } catch (err) {
      console.error('Failed to toggle table management:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleWizardComplete = async (newTables: VenueTable[]) => {
    setTables(newTables);
    setShowWizard(false);

    try {
      const res = await fetch('/api/venue/tables/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table_management_enabled: true }),
      });
      if (res.ok) {
        const data = await res.json();
        setSettings(data.settings);
        router.refresh();
      }
    } catch (err) {
      console.error('Failed to enable table management:', err);
    }
  };

  const handleUpdateSettings = async (updates: Partial<TableSettings>) => {
    setSaving(true);
    try {
      const res = await fetch('/api/venue/tables/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (res.ok) {
        const data = await res.json();
        setSettings(data.settings);
      }
    } catch (err) {
      console.error('Failed to update settings:', err);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-brand-600" />
      </div>
    );
  }

  if (showWizard) {
    return <SetupWizard onComplete={handleWizardComplete} onCancel={() => setShowWizard(false)} />;
  }

  const tabs = [
    { key: 'tables' as const, label: 'Tables' },
    { key: 'combinations' as const, label: 'Combinations' },
    { key: 'statuses' as const, label: 'Status Settings' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Table Management</h1>
          <p className="mt-1 text-sm text-slate-500">
            Manage your restaurant&apos;s tables, floor plan, and table assignments.
          </p>
        </div>
        {isAdmin && (
          <button
            onClick={toggleEnabled}
            disabled={saving}
            className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 ${
              settings.table_management_enabled ? 'bg-brand-600' : 'bg-slate-200'
            }`}
          >
            <span
              className={`inline-block h-6 w-6 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                settings.table_management_enabled ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        )}
      </div>

      {!settings.table_management_enabled && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-6 py-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-slate-100">
            <svg className="h-8 w-8 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-slate-900">Table Management is Off</h3>
          <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">
            Enable table management to assign specific tables to bookings, view your floor plan,
            and use the timeline grid. Your covers-based availability system will continue to work
            alongside table management.
          </p>
          {isAdmin && (
            <button
              onClick={toggleEnabled}
              disabled={saving}
              className="mt-4 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand-700 disabled:opacity-50"
            >
              Enable Table Management
            </button>
          )}
        </div>
      )}

      {settings.table_management_enabled && (
        <>
          <div className="rounded-xl border border-brand-100 bg-brand-50/40 px-4 py-3 text-xs text-brand-800">
            Table management is enabled. Use <span className="font-semibold">Table Grid</span> and <span className="font-semibold">Floor Plan</span> as your primary live-service views.
          </div>
          <div className="border-b border-slate-200">
            <nav className="-mb-px flex space-x-6">
              {tabs.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`whitespace-nowrap border-b-2 px-1 pb-3 text-sm font-medium transition-colors ${
                    activeTab === tab.key
                      ? 'border-brand-600 text-brand-600'
                      : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700'
                  }`}
                >
                  {tab.label}
                  {tab.key === 'tables' && tables.length > 0 && (
                    <span className="ml-1.5 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                      {tables.length}
                    </span>
                  )}
                </button>
              ))}
            </nav>
          </div>

          {activeTab === 'tables' && (
            <>
              {tables.length > 0 && isAdmin && (
                <Link
                  href="/dashboard/availability?tab=table&fp=layout"
                  className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm transition-colors hover:border-brand-200 hover:bg-brand-50/30"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-100">
                    <svg className="h-5 w-5 text-brand-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 00-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0z" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-slate-900">Floor Plan Editor</p>
                    <p className="text-xs text-slate-500">Drag and arrange tables on your restaurant floor plan</p>
                  </div>
                  <svg className="h-5 w-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                  </svg>
                </Link>
              )}
              <TableList
                tables={tables}
                setTables={setTables}
                isAdmin={isAdmin}
                onRefresh={fetchData}
              />
            </>
          )}

          {activeTab === 'combinations' && (
            <TableCombinationsPage
              combinations={combinations}
              setCombinations={setCombinations}
              tables={tables}
              isAdmin={isAdmin}
              onRefresh={fetchData}
              combinationThreshold={settings.combination_threshold ?? 80}
              onCombinationThresholdSaved={(v) =>
                setSettings((prev) => ({ ...prev, combination_threshold: v }))
              }
            />
          )}

          {activeTab === 'statuses' && (
            <StatusSettings
              settings={settings}
              onUpdate={handleUpdateSettings}
              saving={saving}
              isAdmin={isAdmin}
            />
          )}
        </>
      )}
    </div>
  );
}
