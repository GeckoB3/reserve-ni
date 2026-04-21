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

/**
 * Real floor-plan geometry for a table: centre (position_x/y), size (width/height
 * as layout-percentage units), rotation, and shape. This matches how the Layout
 * tab renders tables, so the preview looks like the floor plan rather than the
 * combination engine's internal axis-aligned box convention.
 */
interface TableGeom {
  id: string;
  name: string;
  shape: string;
  cx: number;
  cy: number;
  w: number;
  h: number;
  rotation: number;
  /** AABB of the rotated shape centered on (cx, cy). Used only for layout/viewBox. */
  aabb: { left: number; right: number; top: number; bottom: number };
  /** Optional polygon points (percentage 0–100 within the table's local box). */
  polygonPoints: { x: number; y: number }[] | null;
}

function computeAabb(cx: number, cy: number, w: number, h: number, rotation: number) {
  const rad = (rotation * Math.PI) / 180;
  const cos = Math.abs(Math.cos(rad));
  const sin = Math.abs(Math.sin(rad));
  const halfW = (w * cos + h * sin) / 2;
  const halfH = (w * sin + h * cos) / 2;
  return {
    left: cx - halfW,
    right: cx + halfW,
    top: cy - halfH,
    bottom: cy + halfH,
  };
}

function toTableGeom(t: VenueTable): TableGeom {
  const dims = getTableDimensions(t.max_covers, t.shape);
  const w = t.width ?? dims.width;
  const h = t.height ?? dims.height;
  const cx = t.position_x ?? 50;
  const cy = t.position_y ?? 50;
  const rotation = t.rotation ?? 0;
  const polygonPoints = Array.isArray(t.polygon_points) ? t.polygon_points : null;
  return {
    id: t.id,
    name: t.name,
    shape: t.shape,
    cx,
    cy,
    w,
    h,
    rotation,
    aabb: computeAabb(cx, cy, w, h, rotation),
    polygonPoints,
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

  const geomTables = useMemo(() => tables.map(toTableGeom), [tables]);
  const geomById = useMemo(() => {
    const m = new Map<string, TableGeom>();
    for (const g of geomTables) m.set(g.id, g);
    return m;
  }, [geomTables]);

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

  const selectedGeom = useMemo(
    () => (selectedId ? geomById.get(selectedId) ?? null : null),
    [selectedId, geomById],
  );

  // Compute a tight viewBox around all rendered shapes (centered at position_x/y)
  // so the diagram is centred in the SVG regardless of where tables sit on the canvas.
  const viewBox = useMemo(() => {
    if (geomTables.length === 0) return '0 0 100 100';
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const g of geomTables) {
      if (g.aabb.left < minX) minX = g.aabb.left;
      if (g.aabb.top < minY) minY = g.aabb.top;
      if (g.aabb.right > maxX) maxX = g.aabb.right;
      if (g.aabb.bottom > maxY) maxY = g.aabb.bottom;
    }
    const spanX = maxX - minX;
    const spanY = maxY - minY;
    const pad = Math.max(spanX, spanY) * 0.14 + 6;
    return `${minX - pad} ${minY - pad} ${spanX + pad * 2} ${spanY + pad * 2}`;
  }, [geomTables]);

  const viewBoxRect = useMemo(() => {
    const parts = viewBox.split(/\s+/).map(Number);
    if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) {
      return { x: 0, y: 0, w: 100, h: 100 };
    }
    return { x: parts[0]!, y: parts[1]!, w: parts[2]!, h: parts[3]! };
  }, [viewBox]);

  /** SVG stroke width scaled to the viewBox so lines look consistent across zoom levels. */
  const baseStroke = useMemo(
    () => Math.max(0.25, Math.min(viewBoxRect.w, viewBoxRect.h) * 0.004),
    [viewBoxRect.w, viewBoxRect.h],
  );

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
        style={{ maxHeight: 320 }}
        onClick={() => setSelectedId(null)}
      >
        <defs>
          <filter id="adj-preview-shadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow
              dx="0"
              dy={baseStroke * 0.8}
              stdDeviation={baseStroke * 0.6}
              floodColor="#0f172a"
              floodOpacity="0.12"
            />
          </filter>
        </defs>

        {selectedGeom && (
          <g pointerEvents="none">
            <line
              x1={viewBoxRect.x}
              y1={selectedGeom.cy}
              x2={viewBoxRect.x + viewBoxRect.w}
              y2={selectedGeom.cy}
              stroke="rgba(16, 185, 129, 0.45)"
              strokeWidth={baseStroke}
              strokeDasharray={`${baseStroke * 6} ${baseStroke * 4}`}
            />
            <line
              x1={selectedGeom.cx}
              y1={viewBoxRect.y}
              x2={selectedGeom.cx}
              y2={viewBoxRect.y + viewBoxRect.h}
              stroke="rgba(16, 185, 129, 0.45)"
              strokeWidth={baseStroke}
              strokeDasharray={`${baseStroke * 6} ${baseStroke * 4}`}
            />
          </g>
        )}

        {geomTables.map((g) => {
          const isSelected = g.id === selectedId;
          const isAdjacent = adjacentIds.has(g.id);
          const isHovered = g.id === hoveredId;
          const hasSelection = selectedId !== null;

          let fill = '#e2e8f0';
          let stroke = '#94a3b8';
          let opacity = 1;

          if (hasSelection) {
            if (isSelected) {
              fill = '#c7d2fe';
              stroke = '#4338ca';
            } else if (isAdjacent) {
              fill = '#bbf7d0';
              stroke = '#059669';
            } else {
              fill = '#f1f5f9';
              stroke = '#cbd5e1';
              opacity = 0.5;
            }
          } else if (isHovered) {
            fill = '#dbeafe';
            stroke = '#2563eb';
          }

          const strokeWidth = isSelected ? baseStroke * 2.2 : isHovered ? baseStroke * 1.6 : baseStroke * 1.1;
          const textFill = hasSelection && !isSelected && !isAdjacent ? '#94a3b8' : '#1e293b';
          const textWeight = isSelected || isAdjacent || isHovered ? 600 : 500;

          const isCircle = g.shape === 'circle';
          const isOval = g.shape === 'oval';
          const isPolygon = g.shape === 'polygon' && g.polygonPoints && g.polygonPoints.length >= 3;
          const isSquare = g.shape === 'square';

          // Rotation around the table's actual centre.
          const transform = g.rotation ? `rotate(${g.rotation} ${g.cx} ${g.cy})` : undefined;

          // Fit label to the smaller of width/height so text stays inside the shape.
          const labelSize = Math.min(g.w, g.h) * 0.32;
          const labelStroke = Math.max(baseStroke * 0.6, labelSize * 0.04);

          let shapeNode: React.ReactNode;
          if (isCircle) {
            const r = Math.min(g.w, g.h) / 2;
            shapeNode = (
              <circle
                cx={g.cx}
                cy={g.cy}
                r={r}
                fill={fill}
                stroke={stroke}
                strokeWidth={strokeWidth}
                filter="url(#adj-preview-shadow)"
              />
            );
          } else if (isOval) {
            shapeNode = (
              <ellipse
                cx={g.cx}
                cy={g.cy}
                rx={g.w / 2}
                ry={g.h / 2}
                fill={fill}
                stroke={stroke}
                strokeWidth={strokeWidth}
                filter="url(#adj-preview-shadow)"
              />
            );
          } else if (isPolygon && g.polygonPoints) {
            const pts = g.polygonPoints
              .map((pt) => {
                const px = g.cx + (pt.x / 100 - 0.5) * g.w;
                const py = g.cy + (pt.y / 100 - 0.5) * g.h;
                return `${px},${py}`;
              })
              .join(' ');
            shapeNode = (
              <polygon
                points={pts}
                fill={fill}
                stroke={stroke}
                strokeWidth={strokeWidth}
                strokeLinejoin="round"
                filter="url(#adj-preview-shadow)"
              />
            );
          } else {
            // rectangle / square / l-shape fallback
            const radius = isSquare ? g.w * 0.08 : Math.min(g.w, g.h) * 0.08;
            shapeNode = (
              <rect
                x={g.cx - g.w / 2}
                y={g.cy - g.h / 2}
                width={g.w}
                height={g.h}
                rx={radius}
                ry={radius}
                fill={fill}
                stroke={stroke}
                strokeWidth={strokeWidth}
                filter="url(#adj-preview-shadow)"
              />
            );
          }

          return (
            <g
              key={g.id}
              onClick={(e) => {
                e.stopPropagation();
                setSelectedId(isSelected ? null : g.id);
              }}
              onMouseEnter={() => setHoveredId(g.id)}
              onMouseLeave={() => setHoveredId(null)}
              style={{ cursor: 'pointer' }}
              opacity={opacity}
              transform={transform}
            >
              {shapeNode}
              {/* Label is counter-rotated so it stays horizontal even when the table is rotated. */}
              <g transform={g.rotation ? `rotate(${-g.rotation} ${g.cx} ${g.cy})` : undefined}>
                <text
                  x={g.cx}
                  y={g.cy}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={labelSize}
                  fill={textFill}
                  fontWeight={textWeight}
                  stroke="#ffffff"
                  strokeWidth={labelStroke}
                  strokeLinejoin="round"
                  paintOrder="stroke"
                  pointerEvents="none"
                  style={{ fontFamily: 'Inter, system-ui, sans-serif' }}
                >
                  {g.name}
                </text>
              </g>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
