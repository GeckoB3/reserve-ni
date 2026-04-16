'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { VenueTable } from '@/types/table-management';
import { getTableDimensions } from '@/types/table-management';
import {
  getRotatedBoundingBox,
  getBoundingBoxGap,
  isValidAxisAlignedCombinationPair,
  type CombinationTable,
} from '@/lib/table-management/combination-engine';

interface Props {
  threshold: number;
  /** Increment this to trigger a silent re-fetch of table positions. */
  refreshKey?: number;
  /** When set, only load tables in this dining area (multi-area floor plans). */
  diningAreaId?: string | null;
}

function toCombinationTable(t: VenueTable): CombinationTable {
  const dims = getTableDimensions(t.max_covers, t.shape);
  return {
    id: t.id,
    name: t.name,
    max_covers: t.max_covers,
    is_active: t.is_active,
    position_x: t.position_x,
    position_y: t.position_y,
    width: t.width ?? dims.width,
    height: t.height ?? dims.height,
    rotation: t.rotation,
  };
}

export function AdjacencyPreview({ threshold, refreshKey = 0, diningAreaId }: Props) {
  const [tables, setTables] = useState<VenueTable[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const fetchTables = useCallback(async (showSpinner = false) => {
    if (showSpinner) setLoading(true);
    try {
      const qs = diningAreaId ? `?area_id=${encodeURIComponent(diningAreaId)}` : '';
      const res = await fetch(`/api/venue/tables${qs}`);
      if (!res.ok || !mountedRef.current) return;
      const data = await res.json();
      if (!mountedRef.current) return;
      setTables((data.tables ?? []).filter((t: VenueTable) => t.is_active));
    } catch {
      // Non-critical — diagram will show stale data
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [diningAreaId]);

  useEffect(() => {
    mountedRef.current = true;
    void fetchTables(true);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void fetchTables(false);
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      mountedRef.current = false;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [fetchTables]);

  // Re-fetch silently whenever the parent signals a new layout save.
  useEffect(() => {
    if (refreshKey === 0) return;
    void fetchTables(false);
  }, [refreshKey, fetchTables]);

  const comboTables = useMemo(
    () => tables.map(toCombinationTable),
    [tables],
  );

  /** Same pairwise rule as {@link detectAdjacentTables}: gap ≤ threshold and same row or column (not diagonal-only). */
  const adjacentIds = useMemo(() => {
    if (!selectedId) return new Set<string>();
    const selected = comboTables.find((t) => t.id === selectedId);
    if (!selected) return new Set<string>();
    const selectedBox = getRotatedBoundingBox(selected);
    const result = new Set<string>();
    for (const t of comboTables) {
      if (t.id === selectedId) continue;
      const box = getRotatedBoundingBox(t);
      if (getBoundingBoxGap(selectedBox, box) > threshold) continue;
      if (!isValidAxisAlignedCombinationPair(selectedBox, box)) continue;
      result.add(t.id);
    }
    return result;
  }, [selectedId, comboTables, threshold]);

  const selectedTable = useMemo(
    () => comboTables.find((t) => t.id === selectedId) ?? null,
    [selectedId, comboTables],
  );

  const selectedCenter = useMemo(() => {
    if (!selectedTable) return null;
    const box = getRotatedBoundingBox(selectedTable);
    return {
      cx: (box.left + box.right) / 2,
      cy: (box.top + box.bottom) / 2,
    };
  }, [selectedTable]);

  // Compute a tight viewBox around all table bounding boxes so the diagram is
  // centred in the SVG regardless of where tables are positioned on the canvas.
  const viewBox = useMemo(() => {
    if (comboTables.length === 0) return '0 0 100 100';
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const t of comboTables) {
      const b = getRotatedBoundingBox(t);
      if (b.left < minX) minX = b.left;
      if (b.top < minY) minY = b.top;
      if (b.right > maxX) maxX = b.right;
      if (b.bottom > maxY) maxY = b.bottom;
    }
    const pad = Math.max((maxX - minX), (maxY - minY)) * 0.12 + 10;
    return `${minX - pad} ${minY - pad} ${maxX - minX + pad * 2} ${maxY - minY + pad * 2}`;
  }, [comboTables]);

  const viewBoxRect = useMemo(() => {
    const parts = viewBox.split(/\s+/).map(Number);
    if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) {
      return { x: 0, y: 0, w: 100, h: 100 };
    }
    return { x: parts[0]!, y: parts[1]!, w: parts[2]!, h: parts[3]! };
  }, [viewBox]);

  if (loading) {
    return (
      <div className="mt-3 flex h-40 items-center justify-center rounded-lg border border-slate-200 bg-white">
        <span className="text-xs text-slate-400">Loading floor plan...</span>
      </div>
    );
  }

  if (tables.length === 0) {
    return (
      <div className="mt-3 flex h-24 items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white">
        <span className="text-xs text-slate-400">No tables configured yet</span>
      </div>
    );
  }

  const adjacentCount = adjacentIds.size;

  return (
    <div className="mt-3">
      <div className="mb-1.5 flex items-center justify-between">
        <p className="text-[11px] text-slate-400">
          {selectedId
            ? `${adjacentCount} table${adjacentCount !== 1 ? 's' : ''} on the same row or column within ${threshold}px gap. The cross shows the axes; green tables can combine.`
            : 'Click a table to preview same-row/column neighbours within the detection distance (horizontal and vertical from the table centre, not a radius).'}
        </p>
        <button
          type="button"
          onClick={() => void fetchTables(false)}
          className="ml-3 shrink-0 rounded px-2 py-0.5 text-[11px] font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-700"
          title="Reload positions from latest saved layout"
        >
          Refresh
        </button>
      </div>
      <svg
        viewBox={viewBox}
        className="w-full rounded-lg border border-slate-200 bg-white"
        style={{ maxHeight: 300 }}
        onClick={() => setSelectedId(null)}
      >
        {selectedCenter && (
          <g pointerEvents="none">
            <line
              x1={viewBoxRect.x}
              y1={selectedCenter.cy}
              x2={viewBoxRect.x + viewBoxRect.w}
              y2={selectedCenter.cy}
              stroke="rgba(16, 185, 129, 0.45)"
              strokeWidth={Math.max(0.15, viewBoxRect.w * 0.001)}
              strokeDasharray="4 3"
            />
            <line
              x1={selectedCenter.cx}
              y1={viewBoxRect.y}
              x2={selectedCenter.cx}
              y2={viewBoxRect.y + viewBoxRect.h}
              stroke="rgba(16, 185, 129, 0.45)"
              strokeWidth={Math.max(0.15, viewBoxRect.w * 0.001)}
              strokeDasharray="4 3"
            />
          </g>
        )}

        {comboTables.map((t) => {
          const box = getRotatedBoundingBox(t);
          const w = box.right - box.left;
          const h = box.bottom - box.top;
          const isSelected = t.id === selectedId;
          const isAdjacent = adjacentIds.has(t.id);
          const isHovered = t.id === hoveredId;
          const hasSelection = selectedId !== null;

          let fill = '#e2e8f0';
          let stroke = '#94a3b8';
          let opacity = 1;

          if (hasSelection) {
            if (isSelected) {
              fill = '#6366f1';
              stroke = '#4338ca';
            } else if (isAdjacent) {
              fill = '#34d399';
              stroke = '#059669';
            } else {
              fill = '#f1f5f9';
              stroke = '#cbd5e1';
              opacity = 0.5;
            }
          } else if (isHovered) {
            fill = '#c7d2fe';
            stroke = '#6366f1';
          }

          const isCircular = tables.find((vt) => vt.id === t.id)?.shape === 'circle';

          return (
            <g
              key={t.id}
              onClick={(e) => {
                e.stopPropagation();
                setSelectedId(isSelected ? null : t.id);
              }}
              onMouseEnter={() => setHoveredId(t.id)}
              onMouseLeave={() => setHoveredId(null)}
              style={{ cursor: 'pointer' }}
              opacity={opacity}
            >
              {isCircular ? (
                <ellipse
                  cx={box.left + w / 2}
                  cy={box.top + h / 2}
                  rx={w / 2}
                  ry={h / 2}
                  fill={fill}
                  stroke={stroke}
                  strokeWidth={isSelected || isHovered ? 0.5 : 0.3}
                />
              ) : (
                <rect
                  x={box.left}
                  y={box.top}
                  width={w}
                  height={h}
                  rx={0.6}
                  ry={0.6}
                  fill={fill}
                  stroke={stroke}
                  strokeWidth={isSelected || isHovered ? 0.5 : 0.3}
                />
              )}
              <text
                x={box.left + w / 2}
                y={box.top + h / 2}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={Math.min(w, h) * 0.45}
                fill={isSelected ? '#fff' : '#334155'}
                fontWeight={isSelected || isAdjacent ? 600 : 400}
                pointerEvents="none"
              >
                {t.name}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
