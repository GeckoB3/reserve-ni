'use client';

import { useState } from 'react';
import { NumericInput } from '@/components/ui/NumericInput';

const ALL_STATUSES = [
  { key: 'available', label: 'Available', required: true, color: 'bg-green-500' },
  { key: 'reserved', label: 'Reserved', required: false, color: 'bg-blue-500' },
  { key: 'seated', label: 'Seated', required: true, color: 'bg-emerald-500' },
  { key: 'starters', label: 'Starters', required: false, color: 'bg-yellow-500' },
  { key: 'mains', label: 'Mains', required: false, color: 'bg-orange-500' },
  { key: 'dessert', label: 'Dessert', required: false, color: 'bg-pink-500' },
  { key: 'bill', label: 'Bill', required: false, color: 'bg-purple-500' },
  { key: 'paid', label: 'Paid', required: true, color: 'bg-slate-500' },
  { key: 'bussing', label: 'Bussing', required: false, color: 'bg-slate-400' },
];

interface Settings {
  auto_bussing_minutes: number;
  active_table_statuses: string[];
}

interface Props {
  settings: Settings;
  onUpdate: (updates: Partial<Settings>) => void;
  saving: boolean;
  isAdmin: boolean;
}

export function StatusSettings({ settings, onUpdate, saving, isAdmin }: Props) {
  const [autoBussing, setAutoBussing] = useState(settings.auto_bussing_minutes);
  const [activeStatuses, setActiveStatuses] = useState<string[]>(settings.active_table_statuses);

  const toggleStatus = (key: string) => {
    const status = ALL_STATUSES.find((s) => s.key === key);
    if (status?.required) return;

    setActiveStatuses((prev) =>
      prev.includes(key) ? prev.filter((s) => s !== key) : [...prev, key]
    );
  };

  const handleSave = () => {
    onUpdate({
      active_table_statuses: activeStatuses,
      auto_bussing_minutes: autoBussing,
    });
  };

  const hasChanges =
    autoBussing !== settings.auto_bussing_minutes ||
    JSON.stringify(activeStatuses.sort()) !== JSON.stringify([...settings.active_table_statuses].sort());

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="mb-1 text-base font-medium text-slate-900">Table Status Progression</h3>
        <p className="mb-4 text-sm text-slate-500">
          Choose which statuses your restaurant uses. Required statuses cannot be disabled.
        </p>
        <div className="space-y-2">
          {ALL_STATUSES.map((status) => {
            const isActive = activeStatuses.includes(status.key);
            return (
              <label
                key={status.key}
                className={`flex items-center gap-3 rounded-lg border px-4 py-3 transition-colors ${
                  isActive ? 'border-slate-200 bg-white' : 'border-slate-100 bg-slate-50 opacity-60'
                } ${status.required ? 'cursor-not-allowed' : isAdmin ? 'cursor-pointer hover:bg-slate-50/80' : ''}`}
              >
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={() => toggleStatus(status.key)}
                  disabled={status.required || !isAdmin}
                  className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                />
                <span className={`inline-block h-3 w-3 rounded-full ${status.color}`} />
                <span className="text-sm font-medium text-slate-700">{status.label}</span>
                {status.required && (
                  <span className="ml-auto text-xs text-slate-400">Required</span>
                )}
              </label>
            );
          })}
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="mb-1 text-base font-medium text-slate-900">Auto-Bussing</h3>
        <p className="mb-4 text-sm text-slate-500">
          Automatically set a table to &quot;Available&quot; after the &quot;Paid&quot; status has been active for this many minutes.
        </p>
        <div className="flex items-center gap-3">
          <NumericInput
            value={autoBussing}
            onChange={(v) => setAutoBussing(v)}
            min={0}
            max={60}
            disabled={!isAdmin}
            className="w-20 rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
          />
          <span className="text-sm text-slate-500">minutes after &quot;Paid&quot;</span>
        </div>
      </div>

      {isAdmin && hasChanges && (
        <div className="flex justify-end">
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand-700 disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      )}
    </div>
  );
}
