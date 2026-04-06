'use client';

import { useState } from 'react';
import type { VenueTable, TableShape } from '@/types/table-management';
import { getTableDimensions } from '@/types/table-management';
import { NumericInput } from '@/components/ui/NumericInput';

interface Props {
  tables: VenueTable[];
  setTables: (tables: VenueTable[]) => void;
  isAdmin: boolean;
  onRefresh: () => void;
  variant?: 'full' | 'covers';
}

const SHAPES: { value: TableShape; label: string }[] = [
  { value: 'rectangle', label: 'Rectangle' },
  { value: 'circle', label: 'Circle' },
  { value: 'square', label: 'Square' },
  { value: 'oval', label: 'Oval' },
  { value: 'l-shape', label: 'L-Shape' },
];

interface EditingTable {
  id?: string;
  name: string;
  min_covers: number;
  max_covers: number;
  shape: TableShape;
  zone: string;
  server_section: string;
  is_active: boolean;
}

const emptyTable: EditingTable = {
  name: '',
  min_covers: 1,
  max_covers: 2,
  shape: 'rectangle',
  zone: '',
  server_section: '',
  is_active: true,
};

export function TableList({ tables, setTables, isAdmin, onRefresh, variant = 'full' }: Props) {
  const isCovers = variant === 'covers';
  const [editing, setEditing] = useState<EditingTable | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showBatch, setShowBatch] = useState(false);
  const [batchCount, setBatchCount] = useState(10);
  const [batchPrefix, setBatchPrefix] = useState('Table');
  const [batchMaxCovers, setBatchMaxCovers] = useState(4);

  const zones = [...new Set(tables.map((t) => t.zone).filter(Boolean))] as string[];

  const saveTable = async () => {
    if (!editing) return;
    setSaving(true);
    setError(null);

    try {
      if (editing.id) {
        const res = await fetch('/api/venue/tables', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: editing.id,
            name: editing.name,
            min_covers: editing.min_covers,
            max_covers: editing.max_covers,
            shape: editing.shape,
            zone: editing.zone || null,
            server_section: editing.server_section || null,
            is_active: editing.is_active,
          }),
        });
        if (!res.ok) {
          const data = await res.json();
          setError(data.error ?? 'Failed to update table');
          return;
        }
        const { table } = await res.json();
        setTables(tables.map((t) => (t.id === table.id ? table : t)));
      } else {
        const dims = getTableDimensions(editing.max_covers, editing.shape);
        const res = await fetch('/api/venue/tables', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: editing.name,
            min_covers: editing.min_covers,
            max_covers: editing.max_covers,
            shape: editing.shape,
            zone: editing.zone || null,
            server_section: editing.server_section || null,
            is_active: editing.is_active,
            sort_order: tables.length,
            width: dims.width,
            height: dims.height,
          }),
        });
        if (!res.ok) {
          const data = await res.json();
          setError(data.error ?? 'Failed to create table');
          return;
        }
        onRefresh();
      }
      setEditing(null);
    } catch (err) {
      console.error('Save table error:', err);
      setError('Failed to save table');
    } finally {
      setSaving(false);
    }
  };

  const deleteTable = async (id: string) => {
    if (!confirm('Delete this table? This cannot be undone.')) return;

    try {
      const res = await fetch(`/api/venue/tables?id=${id}`, { method: 'DELETE' });
      if (res.ok) {
        setTables(tables.filter((t) => t.id !== id));
      }
    } catch (err) {
      console.error('Delete table error:', err);
    }
  };

  const duplicateTable = (table: VenueTable) => {
    setEditing({
      name: `${table.name} (copy)`,
      min_covers: table.min_covers,
      max_covers: table.max_covers,
      shape: table.shape as TableShape,
      zone: table.zone ?? '',
      server_section: table.server_section ?? '',
      is_active: table.is_active,
    });
  };

  const createBatch = async () => {
    setSaving(true);
    setError(null);

    const newTables = Array.from({ length: batchCount }, (_, i) => {
      const shape = batchMaxCovers <= 2 ? 'circle' as const : 'rectangle' as const;
      const dims = getTableDimensions(batchMaxCovers, shape);
      return {
        name: `${batchPrefix} ${tables.length + i + 1}`,
        min_covers: 1,
        max_covers: batchMaxCovers,
        shape,
        width: dims.width,
        height: dims.height,
        sort_order: tables.length + i,
      };
    });

    try {
      const res = await fetch('/api/venue/tables', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tables: newTables }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? 'Failed to create tables');
        return;
      }

      setShowBatch(false);
      onRefresh();
    } catch (err) {
      console.error('Batch create error:', err);
      setError('Failed to create tables');
    } finally {
      setSaving(false);
    }
  };

  const groupedByZone = new Map<string, VenueTable[]>();
  const noZone: VenueTable[] = [];
  for (const t of tables) {
    if (t.zone) {
      const existing = groupedByZone.get(t.zone) ?? [];
      existing.push(t);
      groupedByZone.set(t.zone, existing);
    } else {
      noZone.push(t);
    }
  }

  return (
    <div className="space-y-4">
      {isAdmin && (
        <div className="flex gap-2">
          <button
            onClick={() => setEditing({ ...emptyTable })}
            className="rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand-700"
          >
            + Add Table
          </button>
          <button
            onClick={() => setShowBatch(true)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
          >
            + Add Multiple
          </button>
        </div>
      )}

      {showBatch && (
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="mb-4 text-base font-medium text-slate-900">Add Multiple Tables</h3>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-600">Count</label>
              <div className="mt-1 flex gap-1">
                {[5, 10, 15, 20, 25, 30].map((n) => (
                  <button
                    key={n}
                    onClick={() => setBatchCount(n)}
                    className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium ${
                      batchCount === n
                        ? 'border-brand-300 bg-brand-50 text-brand-700'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600">Prefix</label>
              <input
                type="text"
                value={batchPrefix}
                onChange={(e) => setBatchPrefix(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600">Max Covers</label>
              <NumericInput
                value={batchMaxCovers}
                onChange={(v) => setBatchMaxCovers(v)}
                min={1}
                max={50}
                className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
              />
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <button
              onClick={createBatch}
              disabled={saving}
              className="rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {saving ? 'Creating...' : `Create ${batchCount} Tables`}
            </button>
            <button
              onClick={() => setShowBatch(false)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {editing && (
        <div className="rounded-xl border border-brand-200 bg-brand-50/30 p-5 shadow-sm">
          <h3 className="mb-4 text-base font-medium text-slate-900">
            {editing.id ? 'Edit Table' : 'New Table'}
          </h3>
          {error && (
            <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
          )}
          <div className={`grid gap-4 ${isCovers ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-3'}`}>
            <div>
              <label className="block text-xs font-medium text-slate-600">Name</label>
              <input
                type="text"
                value={editing.name}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
                placeholder="e.g. T1, Booth A"
              />
            </div>
            {!isCovers && (
              <div>
                <label className="block text-xs font-medium text-slate-600">Min Covers</label>
                <NumericInput
                  value={editing.min_covers}
                  onChange={(v) => setEditing({ ...editing, min_covers: v })}
                  min={1}
                  max={50}
                  className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
                />
              </div>
            )}
            <div>
              <label className="block text-xs font-medium text-slate-600">{isCovers ? 'Seats' : 'Max Covers'}</label>
              <NumericInput
                value={editing.max_covers}
                onChange={(v) => setEditing({ ...editing, max_covers: v, ...(isCovers ? { min_covers: 1 } : {}) })}
                min={1}
                max={50}
                className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
              />
            </div>
            {!isCovers && (
              <>
                <div>
                  <label className="block text-xs font-medium text-slate-600">Shape</label>
                  <select
                    value={editing.shape}
                    onChange={(e) => setEditing({ ...editing, shape: e.target.value as TableShape })}
                    className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
                  >
                    {SHAPES.map((s) => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600">Zone</label>
                  <input
                    type="text"
                    value={editing.zone}
                    onChange={(e) => setEditing({ ...editing, zone: e.target.value })}
                    className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
                    placeholder="e.g. Main floor, Upper level"
                    list="zone-suggestions"
                  />
                  {zones.length > 0 && (
                    <datalist id="zone-suggestions">
                      {zones.map((z) => <option key={z} value={z} />)}
                    </datalist>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600">Server Section</label>
                  <input
                    type="text"
                    value={editing.server_section}
                    onChange={(e) => setEditing({ ...editing, server_section: e.target.value })}
                    className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
                    placeholder="Optional"
                  />
                </div>
              </>
            )}
          </div>
          <div className="mt-3 flex items-center gap-2">
            <label className="text-xs font-medium text-slate-600">Active</label>
            <button
              onClick={() => setEditing({ ...editing, is_active: !editing.is_active })}
              className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                editing.is_active ? 'bg-brand-600' : 'bg-slate-200'
              }`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition ${
                editing.is_active ? 'translate-x-4' : 'translate-x-0'
              }`} />
            </button>
          </div>
          <div className="mt-4 flex gap-2">
            <button
              onClick={saveTable}
              disabled={saving || !editing.name.trim()}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {saving ? 'Saving...' : editing.id ? 'Save Changes' : 'Add Table'}
            </button>
            <button
              onClick={() => { setEditing(null); setError(null); }}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {tables.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 px-6 py-8 text-center">
          <p className="text-sm text-slate-500">No tables configured yet. Add your first table above.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {!isCovers && zones.length > 0 && (
            <>
              {Array.from(groupedByZone.entries()).map(([zone, zoneTables]) => (
                <div key={zone}>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">{zone}</h3>
                  <TableGrid
                    tables={zoneTables}
                    isAdmin={isAdmin}
                    variant={variant}
                    onEdit={(t) => setEditing({
                      id: t.id,
                      name: t.name,
                      min_covers: t.min_covers,
                      max_covers: t.max_covers,
                      shape: t.shape as TableShape,
                      zone: t.zone ?? '',
                      server_section: t.server_section ?? '',
                      is_active: t.is_active,
                    })}
                    onDelete={deleteTable}
                    onDuplicate={duplicateTable}
                  />
                </div>
              ))}
              {noZone.length > 0 && (
                <div>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">No Zone</h3>
                  <TableGrid
                    tables={noZone}
                    isAdmin={isAdmin}
                    variant={variant}
                    onEdit={(t) => setEditing({
                      id: t.id,
                      name: t.name,
                      min_covers: t.min_covers,
                      max_covers: t.max_covers,
                      shape: t.shape as TableShape,
                      zone: t.zone ?? '',
                      server_section: t.server_section ?? '',
                      is_active: t.is_active,
                    })}
                    onDelete={deleteTable}
                    onDuplicate={duplicateTable}
                  />
                </div>
              )}
            </>
          )}
          {(isCovers || zones.length === 0) && (
            <TableGrid
              tables={isCovers ? tables : (zones.length === 0 ? tables : [])}
              isAdmin={isAdmin}
              variant={variant}
              onEdit={(t) => setEditing({
                id: t.id,
                name: t.name,
                min_covers: t.min_covers,
                max_covers: t.max_covers,
                shape: t.shape as TableShape,
                zone: t.zone ?? '',
                server_section: t.server_section ?? '',
                is_active: t.is_active,
              })}
              onDelete={deleteTable}
              onDuplicate={duplicateTable}
            />
          )}
        </div>
      )}
    </div>
  );
}

function TableGrid({ tables, isAdmin, onEdit, onDelete, onDuplicate, variant = 'full' }: {
  tables: VenueTable[];
  isAdmin: boolean;
  onEdit: (t: VenueTable) => void;
  onDelete: (id: string) => void;
  onDuplicate: (t: VenueTable) => void;
  variant?: 'full' | 'covers';
}) {
  const isCovers = variant === 'covers';
  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/50">
              <th className="px-4 py-2.5 text-left text-xs font-medium text-slate-500">Name</th>
              {!isCovers && <th className="px-4 py-2.5 text-left text-xs font-medium text-slate-500">Shape</th>}
              <th className="px-4 py-2.5 text-center text-xs font-medium text-slate-500">{isCovers ? 'Seats' : 'Covers'}</th>
              {!isCovers && <th className="px-4 py-2.5 text-left text-xs font-medium text-slate-500">Zone</th>}
              <th className="px-4 py-2.5 text-center text-xs font-medium text-slate-500">Active</th>
              {isAdmin && (
                <th className="px-4 py-2.5 text-right text-xs font-medium text-slate-500">Actions</th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {tables.map((t) => (
              <tr key={t.id} className={`hover:bg-slate-50/50 ${!t.is_active ? 'opacity-50' : ''}`}>
                <td className="px-4 py-2.5 font-medium text-slate-900">{t.name}</td>
                {!isCovers && <td className="px-4 py-2.5 capitalize text-slate-600">{t.shape}</td>}
                <td className="px-4 py-2.5 text-center text-slate-600">{isCovers ? t.max_covers : `${t.min_covers}–${t.max_covers}`}</td>
                {!isCovers && <td className="px-4 py-2.5 text-slate-600">{t.zone ?? '-'}</td>}
                <td className="px-4 py-2.5 text-center">
                  <span className={`inline-block h-2 w-2 rounded-full ${t.is_active ? 'bg-green-500' : 'bg-slate-300'}`} />
                </td>
                {isAdmin && (
                  <td className="px-4 py-2.5 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => onEdit(t)}
                        className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                        title="Edit"
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                        </svg>
                      </button>
                      <button
                        onClick={() => onDuplicate(t)}
                        className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                        title="Duplicate"
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75" />
                        </svg>
                      </button>
                      <button
                        onClick={() => onDelete(t.id)}
                        className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                        title="Delete"
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                        </svg>
                      </button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
