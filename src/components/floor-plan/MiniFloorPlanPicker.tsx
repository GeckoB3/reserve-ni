'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Stage, Layer, Group, Rect } from 'react-konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import type Konva from 'konva';
import TableShape from '@/components/floor-plan/TableShape';
import { getTableDimensions } from '@/types/table-management';

const COLOR_FREE = '#047857';
const COLOR_SELECTED = '#2563eb';
const COLOR_BUSY = '#94a3b8';

const EMPTY_HIDDEN = new Set<string>();

export interface MiniFloorTableRow {
  id: string;
  name: string;
  min_covers: number;
  max_covers: number;
  shape: string;
  position_x: number | null;
  position_y: number | null;
  width: number | null;
  height: number | null;
  rotation: number | null;
  is_active: boolean;
}

export interface MiniFloorPlanPickerProps {
  tables?: MiniFloorTableRow[] | null;
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  occupiedTableIds?: string[];
  partySize: number;
  className?: string;
  minHeight?: number;
}

function computeFit(
  tables: MiniFloorTableRow[],
  canvasW: number,
  canvasH: number,
): { scale: number; x: number; y: number } {
  if (tables.length === 0 || canvasW < 1 || canvasH < 1) {
    return { scale: 1, x: 0, y: 0 };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const t of tables) {
    const fb = getTableDimensions(t.max_covers, t.shape);
    const cx = t.position_x != null ? (t.position_x / 100) * canvasW : canvasW / 2;
    const cy = t.position_y != null ? (t.position_y / 100) * canvasH : canvasH / 2;
    const w = ((t.width ?? fb.width) / 100) * canvasW;
    const h = ((t.height ?? fb.height) / 100) * canvasH;
    minX = Math.min(minX, cx - w / 2);
    maxX = Math.max(maxX, cx + w / 2);
    minY = Math.min(minY, cy - h / 2);
    maxY = Math.max(maxY, cy + h / 2);
  }

  const pad = 28;
  const bw = maxX - minX + pad * 2;
  const bh = maxY - minY + pad * 2;
  const scale = Math.min(canvasW / bw, canvasH / bh, 2.5);
  const midX = (minX + maxX) / 2;
  const midY = (minY + maxY) / 2;
  return {
    scale,
    x: canvasW / 2 - midX * scale,
    y: canvasH / 2 - midY * scale,
  };
}

export default function MiniFloorPlanPicker({
  tables: tablesProp,
  selectedIds,
  onChange,
  occupiedTableIds = [],
  partySize,
  className = '',
  minHeight = 220,
}: MiniFloorPlanPickerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage | null>(null);
  const [dimensions, setDimensions] = useState({ width: 400, height: minHeight });
  const [fetchedTables, setFetchedTables] = useState<MiniFloorTableRow[] | null>(
    tablesProp != null ? tablesProp : null,
  );
  const [fetchLoading, setFetchLoading] = useState(tablesProp == null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [scale, setScale] = useState(1);
  const [stagePos, setStagePos] = useState({ x: 0, y: 0 });

  const occupiedSet = useMemo(() => new Set(occupiedTableIds), [occupiedTableIds]);

  const tables = useMemo(() => {
    const raw = tablesProp ?? fetchedTables ?? [];
    return raw.filter((t) => t.is_active).map((t) => {
      const fb = getTableDimensions(t.max_covers, t.shape);
      return {
        ...t,
        width: Math.max(t.width ?? fb.width, 9),
        height: Math.max(t.height ?? fb.height, 7.5),
      };
    });
  }, [tablesProp, fetchedTables]);

  const isLoading = fetchLoading && tablesProp == null;

  useEffect(() => {
    if (tablesProp != null) {
      setFetchLoading(false);
      return;
    }
    let cancelled = false;
    setFetchLoading(true);
    void (async () => {
      try {
        const res = await fetch('/api/venue/tables');
        if (!res.ok) {
          if (!cancelled) setLoadError('Could not load tables');
          return;
        }
        const payload = await res.json();
        const next = (payload.tables ?? []) as MiniFloorTableRow[];
        if (!cancelled) {
          setFetchedTables(next);
          setLoadError(null);
        }
      } catch {
        if (!cancelled) setLoadError('Could not load tables');
      } finally {
        if (!cancelled) setFetchLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tablesProp]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const w = el.offsetWidth;
      if (w < 1) return;
      const h = Math.max(minHeight, Math.round(w * 0.55));
      setDimensions((prev) => (prev.width === w && prev.height === h ? prev : { width: w, height: h }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [minHeight]);

  const fit = useMemo(
    () => computeFit(tables, dimensions.width, dimensions.height),
    [tables, dimensions.width, dimensions.height],
  );

  useEffect(() => {
    setScale(fit.scale);
    setStagePos({ x: fit.x, y: fit.y });
  }, [fit.scale, fit.x, fit.y]);

  const selectedTableNames = useMemo(() => {
    const names: string[] = [];
    for (const id of selectedIds) {
      const t = tables.find((row) => row.id === id);
      if (t) names.push(t.name);
    }
    return names;
  }, [selectedIds, tables]);

  const combinedCapacity = useMemo(() => {
    let sum = 0;
    for (const id of selectedIds) {
      const t = tables.find((row) => row.id === id);
      if (t) sum += t.max_covers;
    }
    return sum;
  }, [selectedIds, tables]);

  const zoomBy = useCallback(
    (delta: number) => {
      const newScale = Math.max(0.35, Math.min(2.8, scale + delta));
      const cx = dimensions.width / 2;
      const cy = dimensions.height / 2;
      const pointTo = {
        x: (cx - stagePos.x) / scale,
        y: (cy - stagePos.y) / scale,
      };
      setScale(newScale);
      setStagePos({
        x: cx - pointTo.x * newScale,
        y: cy - pointTo.y * newScale,
      });
    },
    [scale, stagePos, dimensions.width, dimensions.height],
  );

  const toggleTable = useCallback(
    (tableId: string) => {
      if (occupiedSet.has(tableId)) return;
      const next = selectedIds.includes(tableId)
        ? selectedIds.filter((id) => id !== tableId)
        : [...selectedIds, tableId];
      onChange(next);
    },
    [occupiedSet, onChange, selectedIds],
  );

  const removeTable = useCallback(
    (tableId: string) => {
      onChange(selectedIds.filter((id) => id !== tableId));
    },
    [onChange, selectedIds],
  );

  const handleStageClick = useCallback((e: KonvaEventObject<MouseEvent | TouchEvent>) => {
    if (e.target === e.target.getStage()) {
      /* keep multi-selection; tap empty does nothing */
    }
  }, []);

  if (loadError) {
    return (
      <div className={`rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-xs text-amber-800 ${className}`}>
        {loadError}
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className={className}>
        <div
          className="flex animate-pulse flex-col items-center justify-center gap-3 overflow-hidden rounded-xl border border-slate-200 bg-slate-100"
          style={{ height: minHeight }}
        >
          <div className="flex gap-3">
            <div className="h-12 w-16 rounded-lg bg-slate-200" />
            <div className="h-12 w-12 rounded-full bg-slate-200" />
            <div className="h-12 w-16 rounded-lg bg-slate-200" />
          </div>
          <div className="flex gap-3">
            <div className="h-12 w-12 rounded-full bg-slate-200" />
            <div className="h-12 w-16 rounded-lg bg-slate-200" />
          </div>
          <p className="text-xs text-slate-400">Loading floor plan...</p>
        </div>
      </div>
    );
  }

  if (tables.length === 0) {
    return (
      <div className={`rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 text-xs text-slate-600 ${className}`}>
        No active tables on the floor plan. Add tables in Settings &rarr; Floor plan.
      </div>
    );
  }

  const capacityOk = selectedIds.length === 0 || combinedCapacity >= partySize;

  return (
    <div className={className}>
      {/* Header: legend + zoom controls */}
      <div className="mb-2 flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
          <span className="flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: COLOR_FREE }} />
            Free
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: COLOR_SELECTED }} />
            Selected
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-sm opacity-50" style={{ background: COLOR_BUSY }} />
            Busy
          </span>
        </div>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => {
              setScale(fit.scale);
              setStagePos({ x: fit.x, y: fit.y });
            }}
            className="rounded border border-slate-200 bg-white px-2 py-0.5 text-[11px] text-slate-600 transition-colors hover:bg-slate-50"
          >
            Fit
          </button>
          <button
            type="button"
            onClick={() => zoomBy(0.15)}
            className="flex h-6 w-6 items-center justify-center rounded border border-slate-200 bg-white text-xs text-slate-600 transition-colors hover:bg-slate-50"
            aria-label="Zoom in"
          >
            +
          </button>
          <button
            type="button"
            onClick={() => zoomBy(-0.15)}
            className="flex h-6 w-6 items-center justify-center rounded border border-slate-200 bg-white text-xs text-slate-600 transition-colors hover:bg-slate-50"
            aria-label="Zoom out"
          >
            &minus;
          </button>
        </div>
      </div>

      {/* Canvas */}
      <div
        ref={containerRef}
        className="overflow-hidden rounded-xl border border-slate-200 bg-slate-100"
        style={{ height: dimensions.height, touchAction: 'none' }}
        aria-label={`Floor plan picker. ${selectedIds.length} table${selectedIds.length !== 1 ? 's' : ''} selected.`}
      >
        <Stage
          ref={(node) => {
            stageRef.current = node;
          }}
          width={dimensions.width}
          height={dimensions.height}
          scaleX={scale}
          scaleY={scale}
          x={stagePos.x}
          y={stagePos.y}
          onClick={handleStageClick}
          onTap={handleStageClick}
          draggable
          onDragEnd={(ev) => {
            if (ev.target === ev.target.getStage()) {
              setStagePos({ x: ev.target.x(), y: ev.target.y() });
            }
          }}
          style={{ background: '#f1f5f9', cursor: 'grab' }}
        >
          <Layer>
            {tables.map((table) => {
              const busy = occupiedSet.has(table.id);
              const isSelected = selectedIds.includes(table.id);
              let statusColour = COLOR_FREE;
              if (busy) statusColour = COLOR_BUSY;
              else if (isSelected) statusColour = COLOR_SELECTED;

              const fb = getTableDimensions(table.max_covers, table.shape);
              const w = ((table.width ?? fb.width) / 100) * dimensions.width;
              const h = ((table.height ?? fb.height) / 100) * dimensions.height;

              return (
                <Group key={table.id} opacity={busy ? 0.45 : 1}>
                  <TableShape
                    table={table}
                    hiddenSides={EMPTY_HIDDEN}
                    isSelected={isSelected && !busy}
                    isEditorMode={false}
                    statusColour={statusColour}
                    booking={null}
                    canvasWidth={dimensions.width}
                    canvasHeight={dimensions.height}
                    compactLabels
                    onClick={() => toggleTable(table.id)}
                    onTap={() => toggleTable(table.id)}
                  />
                  {/* Pointer-cursor hit area over each free table */}
                  {!busy && (
                    <Rect
                      x={
                        (table.position_x != null
                          ? (table.position_x / 100) * dimensions.width
                          : dimensions.width / 2) - w / 2
                      }
                      y={
                        (table.position_y != null
                          ? (table.position_y / 100) * dimensions.height
                          : dimensions.height / 2) - h / 2
                      }
                      width={w}
                      height={h}
                      opacity={0}
                      onMouseEnter={(e) => {
                        const container = e.target.getStage()?.container();
                        if (container) container.style.cursor = 'pointer';
                      }}
                      onMouseLeave={(e) => {
                        const container = e.target.getStage()?.container();
                        if (container) container.style.cursor = 'grab';
                      }}
                      onClick={() => toggleTable(table.id)}
                      onTap={() => toggleTable(table.id)}
                    />
                  )}
                </Group>
              );
            })}
          </Layer>
        </Stage>
      </div>

      {/* Selection summary */}
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {selectedIds.length > 0 ? (
          <>
            {selectedTableNames.map((tName, i) => (
              <span
                key={selectedIds[i]}
                className="inline-flex items-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-800"
              >
                {tName}
                <button
                  type="button"
                  onClick={() => removeTable(selectedIds[i]!)}
                  className="ml-0.5 rounded-sm text-blue-400 transition-colors hover:text-blue-700"
                  aria-label={`Remove ${tName}`}
                >
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                  </svg>
                </button>
              </span>
            ))}

            <span className={`text-[11px] font-medium tabular-nums ${capacityOk ? 'text-emerald-600' : 'text-amber-600'}`}>
              Cap {combinedCapacity} / Party {partySize}
            </span>

            <button
              type="button"
              onClick={() => onChange([])}
              className="ml-auto rounded px-1.5 py-0.5 text-[11px] text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
            >
              Clear
            </button>
          </>
        ) : (
          <p className="text-[11px] text-slate-400">Tap tables above to select for this booking</p>
        )}
      </div>

      {selectedIds.length > 0 && !capacityOk && (
        <p className="mt-1.5 text-[11px] text-amber-600">
          Selected capacity is tight for this party. You can still assign; staff can adjust on the floor.
        </p>
      )}
    </div>
  );
}
