'use client';

import { useState } from 'react';
import type { VenueTable, TableCombination } from '@/types/table-management';
import { NumericInput } from '@/components/ui/NumericInput';

interface Props {
  combinations: TableCombination[];
  setCombinations: (combos: TableCombination[]) => void;
  tables: VenueTable[];
  isAdmin: boolean;
  onRefresh: () => void;
}

export function CombinationList({ combinations, setCombinations, tables, isAdmin, onRefresh }: Props) {
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [selectedTableIds, setSelectedTableIds] = useState<string[]>([]);
  const [minCovers, setMinCovers] = useState(1);
  const [maxCovers, setMaxCovers] = useState(4);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleTable = (id: string) => {
    setSelectedTableIds((prev) =>
      prev.includes(id) ? prev.filter((tid) => tid !== id) : [...prev, id]
    );
  };

  const handleCreate = async () => {
    if (selectedTableIds.length < 2) {
      setError('Select at least 2 tables for a combination');
      return;
    }
    if (!name.trim()) {
      setError('Name is required');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const res = await fetch('/api/venue/tables/combinations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          combined_min_covers: minCovers,
          combined_max_covers: maxCovers,
          table_ids: selectedTableIds,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? 'Failed to create combination');
        return;
      }

      setShowCreate(false);
      setName('');
      setSelectedTableIds([]);
      setMinCovers(1);
      setMaxCovers(4);
      onRefresh();
    } catch (err) {
      console.error('Create combination error:', err);
      setError('Failed to create combination');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this combination?')) return;

    try {
      const res = await fetch(`/api/venue/tables/combinations?id=${id}`, { method: 'DELETE' });
      if (res.ok) {
        setCombinations(combinations.filter((c) => c.id !== id));
      }
    } catch (err) {
      console.error('Delete combination error:', err);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">
          Combine tables for larger parties. The system will automatically try combinations when no single table fits.
        </p>
        {isAdmin && (
          <button
            onClick={() => setShowCreate(true)}
            className="rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand-700"
          >
            + Create Combination
          </button>
        )}
      </div>

      {showCreate && (
        <div className="rounded-xl border border-brand-200 bg-brand-50/30 p-5 shadow-sm">
          <h3 className="mb-4 text-base font-medium text-slate-900">New Combination</h3>
          {error && (
            <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
          )}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-600">Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
                placeholder="Tables 1+2"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600">Min Covers (combined)</label>
              <NumericInput
                value={minCovers}
                onChange={(v) => setMinCovers(v)}
                min={1}
                className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600">Max Covers (combined)</label>
              <NumericInput
                value={maxCovers}
                onChange={(v) => setMaxCovers(v)}
                min={1}
                className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
              />
            </div>
          </div>
          <div className="mt-4">
            <label className="block text-xs font-medium text-slate-600">Select Tables</label>
            <div className="mt-2 flex flex-wrap gap-2">
              {tables.filter((t) => t.is_active).map((t) => (
                <button
                  key={t.id}
                  onClick={() => toggleTable(t.id)}
                  className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
                    selectedTableIds.includes(t.id)
                      ? 'border-brand-300 bg-brand-50 text-brand-700'
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {t.name} ({t.max_covers})
                </button>
              ))}
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <button
              onClick={handleCreate}
              disabled={saving}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {saving ? 'Creating...' : 'Create Combination'}
            </button>
            <button
              onClick={() => { setShowCreate(false); setError(null); }}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {combinations.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 px-6 py-8 text-center">
          <p className="text-sm text-slate-500">No table combinations configured.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {combinations.map((combo) => (
            <div key={combo.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-medium text-slate-900">{combo.name}</h4>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {combo.combined_min_covers}–{combo.combined_max_covers} covers
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex gap-1">
                    {combo.members?.map((m) => (
                      <span
                        key={m.id}
                        className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-600"
                      >
                        {(m as unknown as { table?: { name: string } }).table?.name ?? m.table_id.slice(0, 8)}
                      </span>
                    ))}
                  </div>
                  {isAdmin && (
                    <button
                      onClick={() => handleDelete(combo.id)}
                      className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
