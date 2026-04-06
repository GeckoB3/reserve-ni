'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import type { VenueTable } from '@/types/table-management';
import { getTableDimensions, computeGridPositions } from '@/types/table-management';
import type { SnapGroupUpdate, SnapRemoveUpdate } from '@/lib/floor-plan/snap-detection';
import Link from 'next/link';

const KonvaCanvas = dynamic(() => import('./KonvaCanvas'), { ssr: false });

interface CombinationLink {
  id: string;
  name: string;
  tableIds: string[];
}

interface Props {
  className?: string;
  embedded?: boolean;
}

export function FloorPlanEditor({ className, embedded = false }: Props) {
  const [tables, setTables] = useState<VenueTable[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [combinations, setCombinations] = useState<CombinationLink[]>([]);
  const [backgroundUrl, setBackgroundUrl] = useState<string | null>(null);
  const [backgroundDraft, setBackgroundDraft] = useState('');
  const [comboSaving, setComboSaving] = useState(false);
  const [joinSnapEnabled, setJoinSnapEnabled] = useState(true);
  const [alignmentGuidesEnabled, setAlignmentGuidesEnabled] = useState(true);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const snapComboRef = useRef<Map<string, string>>(new Map());

  const initialArrangeDone = useRef(false);

  const fetchCombinations = useCallback(async () => {
    try {
      const res = await fetch('/api/venue/tables/combinations');
      if (res.ok) {
        const data = await res.json();
        const links: CombinationLink[] = (data.combinations ?? []).map((c: { id: string; name: string; members?: { table_id: string }[] }) => ({
          id: c.id,
          name: c.name,
          tableIds: (c.members ?? []).map((m: { table_id: string }) => m.table_id),
        }));
        setCombinations(links);
      }
    } catch (err) {
      console.error('Failed to load combinations:', err);
    }
  }, []);

  const fetchTables = useCallback(async () => {
    setLoading(true);
    try {
      const [tablesRes] = await Promise.all([
        fetch('/api/venue/tables'),
        fetchCombinations(),
      ]);
      if (tablesRes.ok) {
        const data = await tablesRes.json();
        setBackgroundUrl(data.settings?.floor_plan_background_url ?? null);
        setBackgroundDraft(data.settings?.floor_plan_background_url ?? '');
        let active = ((data.tables ?? []) as VenueTable[]).filter((t) => t.is_active);

        const allUnpositioned = active.length > 0 && active.every(
          (t) => t.position_x == null || t.position_y == null
        );

        if (allUnpositioned && !initialArrangeDone.current) {
          initialArrangeDone.current = true;
          const positions = computeGridPositions(active);
          active = active.map((t, i) => {
            const dims = getTableDimensions(t.max_covers, t.shape);
            return {
              ...t,
              position_x: positions[i]!.position_x,
              position_y: positions[i]!.position_y,
              width: t.width ?? dims.width,
              height: t.height ?? dims.height,
            };
          });

          const updates = active.map((t) => ({
            id: t.id,
            position_x: t.position_x,
            position_y: t.position_y,
            width: t.width,
            height: t.height,
          }));
          fetch('/api/venue/tables', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updates),
          }).catch((err) => console.error('Auto-arrange save failed:', err));
        }

        setTables(active);
      }
    } catch (err) {
      console.error('Failed to load tables:', err);
    } finally {
      setLoading(false);
    }
  }, [fetchCombinations]);

  useEffect(() => { fetchTables(); }, [fetchTables]);

  // Initialise snap-to-combination mapping from loaded data
  useEffect(() => {
    const groups = new Map<string, Set<string>>();
    for (const t of tables) {
      if (t.snap_group_id) {
        if (!groups.has(t.snap_group_id)) groups.set(t.snap_group_id, new Set());
        groups.get(t.snap_group_id)!.add(t.id);
      }
    }
    for (const combo of combinations) {
      const comboSet = new Set(combo.tableIds);
      for (const [gid, gTids] of groups) {
        if (comboSet.size === gTids.size && [...comboSet].every((id) => gTids.has(id))) {
          snapComboRef.current.set(gid, combo.id);
        }
      }
    }
  }, [tables, combinations]);

  const savePositions = useCallback(async (updatedTables: VenueTable[]) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);

    saveTimerRef.current = setTimeout(async () => {
      setSaveStatus('saving');
      try {
        const updates = updatedTables.map((t) => ({
          id: t.id,
          position_x: t.position_x,
          position_y: t.position_y,
          width: t.width,
          height: t.height,
          rotation: t.rotation,
          snap_group_id: t.snap_group_id,
          snap_sides: t.snap_sides,
        }));

        await fetch('/api/venue/tables', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updates),
        });

        setSaveStatus('saved');
        setTimeout(() => setSaveStatus('idle'), 2000);
      } catch (err) {
        console.error('Save positions failed:', err);
        setSaveStatus('idle');
      }
    }, 1000);
  }, []);

  const handleTableMove = useCallback((tableId: string, x: number, y: number) => {
    setTables((prev) => {
      const updated = prev.map((t) =>
        t.id === tableId ? { ...t, position_x: x, position_y: y } : t
      );
      savePositions(updated);
      return updated;
    });
  }, [savePositions]);

  const handleTableResize = useCallback((tableId: string, width: number, height: number) => {
    setTables((prev) => {
      const updated = prev.map((t) =>
        t.id === tableId ? { ...t, width, height } : t
      );
      savePositions(updated);
      return updated;
    });
  }, [savePositions]);

  const handleTableRotate = useCallback((tableId: string, rotation: number) => {
    setTables((prev) => {
      const updated = prev.map((t) =>
        t.id === tableId ? { ...t, rotation } : t
      );
      savePositions(updated);
      return updated;
    });
  }, [savePositions]);

  const handleGroupMove = useCallback((moves: Array<{ id: string; x: number; y: number }>) => {
    setTables((prev) => {
      const moveMap = new Map(moves.map((m) => [m.id, m]));
      const updated = prev.map((t) => {
        const move = moveMap.get(t.id);
        return move ? { ...t, position_x: move.x, position_y: move.y } : t;
      });
      savePositions(updated);
      return updated;
    });
  }, [savePositions]);

  const handleSnapApply = useCallback(
    async (
      groupUpdate: SnapGroupUpdate,
      pctPositions: Array<{ id: string; x: number; y: number }>,
    ) => {
      const posMap = new Map(pctPositions.map((p) => [p.id, p]));
      const sidesMap = new Map(groupUpdate.tableUpdates.map((u) => [u.id, u]));

      let affectedTables: VenueTable[] = [];

      setTables((prev) => {
        const updated = prev.map((t) => {
          const pos = posMap.get(t.id);
          const snap = sidesMap.get(t.id);
          if (!pos && !snap) return t;
          return {
            ...t,
            ...(pos ? { position_x: pos.x, position_y: pos.y } : {}),
            ...(snap ? { snap_group_id: snap.snap_group_id, snap_sides: snap.snap_sides } : {}),
          };
        });
        affectedTables = updated.filter((t) => sidesMap.has(t.id));
        return updated;
      });

      try {
        const updates = affectedTables.map((t) => ({
          id: t.id,
          position_x: t.position_x,
          position_y: t.position_y,
          width: t.width,
          height: t.height,
          snap_group_id: t.snap_group_id,
          snap_sides: t.snap_sides,
        }));
        await fetch('/api/venue/tables', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updates),
        });
      } catch (err) {
        console.error('Save snap state failed:', err);
      }

      try {
        const existingComboId = snapComboRef.current.get(groupUpdate.groupId);
        if (existingComboId) {
          await fetch(`/api/venue/tables/combinations?id=${existingComboId}`, {
            method: 'DELETE',
          });
        }

        const totalMin = affectedTables.reduce((s, t) => s + t.min_covers, 0);
        const res = await fetch('/api/venue/tables/combinations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: groupUpdate.combinationName,
            combined_min_covers: totalMin,
            combined_max_covers: groupUpdate.combinedMaxCovers,
            table_ids: groupUpdate.tableUpdates.map((u) => u.id),
          }),
        });
        if (res.ok) {
          const data = await res.json();
          snapComboRef.current.set(groupUpdate.groupId, data.combination.id);
        }
        await fetchCombinations();
      } catch (err) {
        console.error('Sync snap combination failed:', err);
      }
    },
    [fetchCombinations],
  );

  const handleSnapRemove = useCallback(
    async (
      removeResult: SnapRemoveUpdate,
      movedTable: { id: string; x: number; y: number },
    ) => {
      const clearedSet = new Set(removeResult.clearedIds);
      const remainingMap = removeResult.remainingGroup
        ? new Map(removeResult.remainingGroup.tableUpdates.map((u) => [u.id, u]))
        : null;

      let affectedTables: VenueTable[] = [];
      let oldGroupId = '';

      setTables((prev) => {
        const src = prev.find((t) => t.id === movedTable.id);
        oldGroupId = src?.snap_group_id ?? '';

        const updated = prev.map((t) => {
          if (t.id === movedTable.id) {
            return { ...t, position_x: movedTable.x, position_y: movedTable.y, snap_group_id: null, snap_sides: null };
          }
          if (clearedSet.has(t.id)) {
            return { ...t, snap_group_id: null, snap_sides: null };
          }
          if (remainingMap?.has(t.id)) {
            const u = remainingMap.get(t.id)!;
            return { ...t, snap_group_id: u.snap_group_id, snap_sides: u.snap_sides };
          }
          return t;
        });

        affectedTables = updated.filter(
          (t) => clearedSet.has(t.id) || t.id === movedTable.id || remainingMap?.has(t.id),
        );
        return updated;
      });

      try {
        const updates = affectedTables.map((t) => ({
          id: t.id,
          position_x: t.position_x,
          position_y: t.position_y,
          snap_group_id: t.snap_group_id,
          snap_sides: t.snap_sides,
        }));
        await fetch('/api/venue/tables', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updates),
        });
      } catch (err) {
        console.error('Save unsnap state failed:', err);
      }

      try {
        const comboId = snapComboRef.current.get(oldGroupId);
        if (comboId) {
          await fetch(`/api/venue/tables/combinations?id=${comboId}`, { method: 'DELETE' });
          snapComboRef.current.delete(oldGroupId);
        }

        if (removeResult.remainingGroup) {
          const rg = removeResult.remainingGroup;
          const rgTables = affectedTables.filter((t) =>
            rg.tableUpdates.some((u) => u.id === t.id),
          );
          const totalMin = rgTables.reduce((s, t) => s + t.min_covers, 0);
          const res = await fetch('/api/venue/tables/combinations', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: rg.combinationName,
              combined_min_covers: totalMin,
              combined_max_covers: rg.combinedMaxCovers,
              table_ids: rg.tableUpdates.map((u) => u.id),
            }),
          });
          if (res.ok) {
            const data = await res.json();
            snapComboRef.current.set(rg.groupId, data.combination.id);
          }
        }
        await fetchCombinations();
      } catch (err) {
        console.error('Sync unsnap combination failed:', err);
      }
    },
    [fetchCombinations],
  );

  const snapToGrid = useCallback(() => {
    const GRID_PCT = 2;
    setTables((prev) => {
      const updated = prev.map((t) => ({
        ...t,
        position_x: t.position_x != null ? Math.round(t.position_x / GRID_PCT) * GRID_PCT : t.position_x,
        position_y: t.position_y != null ? Math.round(t.position_y / GRID_PCT) * GRID_PCT : t.position_y,
      }));
      savePositions(updated);
      return updated;
    });
  }, [savePositions]);

  const autoArrange = useCallback(() => {
    setTables((prev) => {
      const positions = computeGridPositions(prev);
      const updated = prev.map((t, i) => {
        const dims = getTableDimensions(t.max_covers, t.shape);
        return {
          ...t,
          position_x: positions[i]!.position_x,
          position_y: positions[i]!.position_y,
          width: dims.width,
          height: dims.height,
        };
      });
      savePositions(updated);
      return updated;
    });
  }, [savePositions]);

  const handleSelect = useCallback((id: string | null, additive?: boolean) => {
    if (!id) {
      setSelectedIds([]);
      return;
    }
    if (additive) {
      setSelectedIds((prev) =>
        prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
      );
    } else {
      setSelectedIds([id]);
    }
  }, []);

  const selectedId = selectedIds.length === 1 ? selectedIds[0]! : null;
  const selected = selectedId ? tables.find((t) => t.id === selectedId) : null;

  const createCombination = useCallback(async () => {
    if (selectedIds.length < 2) return;
    setComboSaving(true);
    try {
      const selectedTables = tables.filter((t) => selectedIds.includes(t.id));
      const totalCovers = selectedTables.reduce((s, t) => s + t.max_covers, 0);
      const totalMin = selectedTables.reduce((s, t) => s + t.min_covers, 0);
      const name = selectedTables.map((t) => t.name).join(' + ');

      const res = await fetch('/api/venue/tables/combinations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          combined_min_covers: totalMin,
          combined_max_covers: totalCovers,
          table_ids: selectedIds,
        }),
      });
      if (res.ok) {
        await fetchCombinations();
        setSelectedIds([]);
      }
    } catch (err) {
      console.error('Failed to create combination:', err);
    } finally {
      setComboSaving(false);
    }
  }, [selectedIds, tables, fetchCombinations]);

  const deleteCombination = useCallback(async (comboId: string) => {
    try {
      await fetch(`/api/venue/tables/combinations?id=${comboId}`, { method: 'DELETE' });
      await fetchCombinations();
    } catch (err) {
      console.error('Failed to delete combination:', err);
    }
  }, [fetchCombinations]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-brand-600" />
      </div>
    );
  }

  return (
    <div className={`space-y-4 ${className ?? ''}`}>
      <div className="flex items-center justify-between">
        <div>
          {!embedded && <h1 className="text-2xl font-semibold text-slate-900">Floor Plan Editor</h1>}
          <p className="mt-1 text-sm text-slate-500">
            Drag tables to arrange your floor plan. Positions auto-save.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className={`text-xs font-medium ${
            saveStatus === 'saving' ? 'text-amber-600' : saveStatus === 'saved' ? 'text-green-600' : 'text-slate-400'
          }`}>
            {saveStatus === 'saving' ? 'Saving...' : saveStatus === 'saved' ? 'Saved' : ''}
          </span>
          <button
            onClick={autoArrange}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
          >
            Auto-Arrange
          </button>
          {!embedded && (
            <Link
              href="/dashboard/floor-plan"
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
            >
              Back to Floor Plan
            </Link>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
        <div className="lg:col-span-3">
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <KonvaCanvas
              tables={tables}
              backgroundUrl={backgroundUrl}
              selectedId={selectedId}
              selectedIds={selectedIds}
              onSelect={handleSelect}
              onMove={handleTableMove}
              onResize={handleTableResize}
              onGroupMove={handleGroupMove}
              onSnapApply={handleSnapApply}
              onSnapRemove={handleSnapRemove}
              combinationLinks={combinations}
              joinSnapEnabled={joinSnapEnabled}
              alignmentGuidesEnabled={alignmentGuidesEnabled}
            />
          </div>
        </div>

        <div className="space-y-4">
          {selectedIds.length >= 2 && (
            <div className="rounded-xl border border-purple-200 bg-purple-50 p-4 shadow-sm">
              <h3 className="mb-2 text-sm font-semibold text-purple-900">
                {selectedIds.length} Tables Selected
              </h3>
              <p className="mb-3 text-xs text-purple-600">
                {tables.filter((t) => selectedIds.includes(t.id)).map((t) => t.name).join(', ')}
              </p>
              <button
                onClick={createCombination}
                disabled={comboSaving}
                className="w-full rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand-700 disabled:opacity-50"
              >
                {comboSaving ? 'Linking...' : 'Link as Combination'}
              </button>
              <p className="mt-2 text-[10px] text-purple-500">
                Combined covers: {tables.filter((t) => selectedIds.includes(t.id)).reduce((s, t) => s + t.max_covers, 0)}
              </p>
            </div>
          )}

          {selected && selectedIds.length === 1 && (
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="mb-3 text-sm font-semibold text-slate-900">Properties</h3>
              <div className="space-y-3 text-sm">
                <div>
                  <span className="text-xs font-medium text-slate-500">Name</span>
                  <p className="font-medium text-slate-900">{selected.name}</p>
                </div>
                <div>
                  <span className="text-xs font-medium text-slate-500">Covers</span>
                  <p className="text-slate-700">{selected.min_covers}–{selected.max_covers}</p>
                </div>
                <div>
                  <span className="text-xs font-medium text-slate-500">Shape</span>
                  <p className="capitalize text-slate-700">{selected.shape}</p>
                </div>
                {selected.zone && (
                  <div>
                    <span className="text-xs font-medium text-slate-500">Zone</span>
                    <p className="text-slate-700">{selected.zone}</p>
                  </div>
                )}
                <div>
                  <span className="text-xs font-medium text-slate-500">Rotation</span>
                  <div className="mt-1 flex items-center gap-2">
                    <input
                      type="range"
                      min={0}
                      max={360}
                      step={15}
                      value={selected.rotation ?? 0}
                      onChange={(e) => handleTableRotate(selected.id, parseInt(e.target.value))}
                      className="flex-1"
                    />
                    <span className="w-10 text-right text-xs text-slate-600">{selected.rotation ?? 0}°</span>
                  </div>
                  <div className="mt-1 flex gap-1">
                    {[0, 45, 90, 135, 180].map((deg) => (
                      <button
                        key={deg}
                        onClick={() => handleTableRotate(selected.id, deg)}
                        className={`rounded border px-1.5 py-0.5 text-[10px] font-medium ${
                          (selected.rotation ?? 0) === deg
                            ? 'border-brand-300 bg-brand-50 text-brand-700'
                            : 'border-slate-200 text-slate-500 hover:bg-slate-50'
                        }`}
                      >
                        {deg}°
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <span className="text-xs font-medium text-slate-500">Size</span>
                  <div className="mt-1 space-y-1.5">
                    <div className="flex items-center gap-2">
                      <span className="w-10 text-[10px] text-slate-500">W</span>
                      <input
                        type="range"
                        min={4}
                        max={20}
                        step={0.5}
                        value={selected.width ?? getTableDimensions(selected.max_covers, selected.shape).width}
                        onChange={(e) => handleTableResize(
                          selected.id,
                          Number(e.target.value),
                          selected.height ?? getTableDimensions(selected.max_covers, selected.shape).height,
                        )}
                        className="flex-1"
                      />
                      <span className="w-8 text-right text-[10px] text-slate-600">
                        {(selected.width ?? getTableDimensions(selected.max_covers, selected.shape).width).toFixed(1)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-10 text-[10px] text-slate-500">H</span>
                      <input
                        type="range"
                        min={4}
                        max={20}
                        step={0.5}
                        value={selected.height ?? getTableDimensions(selected.max_covers, selected.shape).height}
                        onChange={(e) => handleTableResize(
                          selected.id,
                          selected.width ?? getTableDimensions(selected.max_covers, selected.shape).width,
                          Number(e.target.value),
                        )}
                        className="flex-1"
                      />
                      <span className="w-8 text-right text-[10px] text-slate-600">
                        {(selected.height ?? getTableDimensions(selected.max_covers, selected.shape).height).toFixed(1)}
                      </span>
                    </div>
                  </div>
                </div>
                <div>
                  <span className="text-xs font-medium text-slate-500">Position</span>
                  <p className="text-slate-700">
                    X: {selected.position_x?.toFixed(1) ?? '-'}, Y: {selected.position_y?.toFixed(1) ?? '-'}
                  </p>
                </div>
              </div>
            </div>
          )}

          {combinations.length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="mb-3 text-sm font-semibold text-slate-900">Table Combinations</h3>
              <div className="space-y-2">
                {combinations.map((combo) => (
                  <div key={combo.id} className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
                    <div>
                      <p className="text-xs font-medium text-slate-700">{combo.name}</p>
                      <p className="text-[10px] text-slate-500">
                        {combo.tableIds.length} tables
                      </p>
                    </div>
                    <button
                      onClick={() => deleteCombination(combo.id)}
                      className="text-slate-400 hover:text-red-500"
                      title="Remove combination"
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="mb-3 text-sm font-semibold text-slate-900">Placement Aids</h3>
            <div className="space-y-2.5">
              <label className="flex cursor-pointer items-center justify-between">
                <span className="text-xs text-slate-700">Alignment guides</span>
                <button type="button" role="switch" aria-checked={alignmentGuidesEnabled} onClick={() => setAlignmentGuidesEnabled((v) => !v)} className={`relative inline-flex h-5 w-9 flex-shrink-0 rounded-full border-2 border-transparent transition-colors ${alignmentGuidesEnabled ? 'bg-brand-600' : 'bg-slate-300'}`}>
                  <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition-transform ${alignmentGuidesEnabled ? 'translate-x-4' : 'translate-x-0'}`} />
                </button>
              </label>
              <p className="text-[10px] text-slate-400">When on, tables snap to alignment lines near other tables</p>
              <label className="flex cursor-pointer items-center justify-between">
                <span className="text-xs text-slate-700">Join snap</span>
                <button type="button" role="switch" aria-checked={joinSnapEnabled} onClick={() => setJoinSnapEnabled((v) => !v)} className={`relative inline-flex h-5 w-9 flex-shrink-0 rounded-full border-2 border-transparent transition-colors ${joinSnapEnabled ? 'bg-brand-600' : 'bg-slate-300'}`}>
                  <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition-transform ${joinSnapEnabled ? 'translate-x-4' : 'translate-x-0'}`} />
                </button>
              </label>
              <p className="text-[10px] text-slate-400">When on, tables snap together edge-to-edge and auto-link as combinations</p>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="mb-3 text-sm font-semibold text-slate-900">Actions</h3>
            <div className="mb-3">
              <label className="mb-1 block text-xs font-medium text-slate-500">Background URL</label>
              <input
                type="url"
                value={backgroundDraft}
                onChange={(e) => setBackgroundDraft(e.target.value)}
                placeholder="https://..."
                className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs"
              />
              <div className="mt-1.5 flex gap-2">
                <button
                  onClick={async () => {
                    await fetch('/api/venue/tables/settings', {
                      method: 'PUT',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ floor_plan_background_url: backgroundDraft || null }),
                    });
                    setBackgroundUrl(backgroundDraft || null);
                  }}
                  className="rounded border border-slate-300 px-2 py-1 text-[10px] font-medium text-slate-600 hover:bg-slate-50"
                >
                  Save
                </button>
                <button
                  onClick={async () => {
                    await fetch('/api/venue/tables/settings', {
                      method: 'PUT',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ floor_plan_background_url: null }),
                    });
                    setBackgroundDraft('');
                    setBackgroundUrl(null);
                  }}
                  className="rounded border border-slate-300 px-2 py-1 text-[10px] font-medium text-slate-600 hover:bg-slate-50"
                >
                  Clear
                </button>
              </div>
            </div>
            <button
              onClick={snapToGrid}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
            >
              Snap to Grid
            </button>
            <p className="mt-1.5 text-[10px] text-slate-400">
              Align all tables to a uniform grid
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="mb-3 text-sm font-semibold text-slate-900">Tips</h3>
            <ul className="space-y-1 text-xs text-slate-500">
              <li>• Drag tables to position them freely</li>
              <li>• Toggle alignment guides and join snap above</li>
              <li>• Shift-click to select multiple tables</li>
              <li>• Link selected tables as a combination</li>
              <li>• Scroll to zoom, drag canvas to pan</li>
              <li>• Purple lines show linked combinations</li>
              <li>• Use Snap to Grid for uniform cleanup</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
