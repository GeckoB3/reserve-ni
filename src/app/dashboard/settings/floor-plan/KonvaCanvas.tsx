'use client';

import { useRef, useState, useCallback, useEffect } from 'react';
import { Stage, Layer, Line, Rect, Text, Group, Circle } from 'react-konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import type Konva from 'konva';
import type { VenueTable } from '@/types/table-management';
import { getTableDimensions, computeTableAdjacency } from '@/types/table-management';
import type { BlockedSides } from '@/types/table-management';
import TableShape from '@/components/floor-plan/TableShape';
import {
  detectSnap,
  buildSnapGroup,
  removeFromSnapGroup,
  calculateGroupOutline,
  type SnapDetectResult,
  type SnapTableBounds,
  type SnapGroupUpdate,
  type SnapRemoveUpdate,
} from '@/lib/floor-plan/snap-detection';
import { computeStageFitToView } from '@/lib/floor-plan/fit-view';

// ---------------------------------------------------------------------------
// Constants & helpers
// ---------------------------------------------------------------------------

const SNAP_THRESHOLD = 20;
const ZONE_COLORS: Record<string, string> = {};
const ZONE_PALETTE = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444',
  '#8b5cf6', '#ec4899', '#06b6d4',
];
let colorIdx = 0;

function getZoneColor(zone: string | null): string {
  if (!zone) return '#3b82f6';
  if (!ZONE_COLORS[zone]) {
    ZONE_COLORS[zone] = ZONE_PALETTE[colorIdx % ZONE_PALETTE.length]!;
    colorIdx++;
  }
  return ZONE_COLORS[zone]!;
}

function pctToPixel(pct: number | null, dim: number): number {
  return pct != null ? (pct / 100) * dim : dim / 2;
}

function pixelToPct(px: number, dim: number): number {
  return Math.max(0, Math.min(100, (px / dim) * 100));
}

const EMPTY_HIDDEN = new Set<string>();

function blockedToHiddenSet(blocked?: BlockedSides): Set<string> {
  if (!blocked) return EMPTY_HIDDEN;
  const s = new Set<string>();
  if (blocked.top) s.add('top');
  if (blocked.right) s.add('right');
  if (blocked.bottom) s.add('bottom');
  if (blocked.left) s.add('left');
  return s.size > 0 ? s : EMPTY_HIDDEN;
}

function tableBounds(t: VenueTable, dims: { width: number; height: number }): { x: number; y: number; w: number; h: number } {
  const fb = getTableDimensions(t.max_covers, t.shape);
  return {
    x: pctToPixel(t.position_x, dims.width),
    y: pctToPixel(t.position_y, dims.height),
    w: ((t.width ?? fb.width) / 100) * dims.width,
    h: ((t.height ?? fb.height) / 100) * dims.height,
  };
}

function toSnapBounds(
  t: VenueTable,
  dims: { width: number; height: number },
  overrideXY?: { x: number; y: number },
): SnapTableBounds {
  const b = tableBounds(t, dims);
  return {
    id: t.id,
    x: overrideXY?.x ?? b.x,
    y: overrideXY?.y ?? b.y,
    w: b.w,
    h: b.h,
    shape: t.shape,
    snap_group_id: t.snap_group_id,
    snap_sides: t.snap_sides,
    max_covers: t.max_covers,
    name: t.name,
  };
}

// ---------------------------------------------------------------------------
// Component props
// ---------------------------------------------------------------------------

interface CombinationLink {
  id: string;
  name: string;
  tableIds: string[];
}

interface Props {
  tables: VenueTable[];
  selectedId: string | null;
  selectedIds?: string[];
  onSelect: (id: string | null, additive?: boolean) => void;
  onMove: (id: string, x: number, y: number) => void;
  onResize: (id: string, w: number, h: number) => void;
  onGroupMove?: (moves: Array<{ id: string; x: number; y: number }>) => void;
  onSnapApply?: (result: SnapGroupUpdate, pctPositions: Array<{ id: string; x: number; y: number }>) => void;
  onSnapRemove?: (result: SnapRemoveUpdate, movedTable: { id: string; x: number; y: number }) => void;
  combinationLinks?: CombinationLink[];
  backgroundUrl?: string | null;
  joinSnapEnabled?: boolean;
  alignmentGuidesEnabled?: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function KonvaCanvas({
  tables, selectedId, selectedIds, onSelect, onMove,
  onGroupMove, onSnapApply, onSnapRemove, combinationLinks, backgroundUrl,
  joinSnapEnabled = true, alignmentGuidesEnabled = true,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage | null>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [scale, setScale] = useState(1);
  const [stagePos, setStagePos] = useState({ x: 0, y: 0 });
  const [, forceRender] = useState(0);

  // Drag state (refs to avoid re-renders during drag)
  const dragPosRef = useRef<{ id: string; x: number; y: number } | null>(null);
  const snapGuidesRef = useRef<Array<{ points: number[] }>>([]);

  // Snap-join state
  const snapResultRef = useRef<SnapDetectResult | null>(null);
  const snapGuideEdgeRef = useRef<number[] | null>(null);
  const snapGhostRef = useRef<{ x: number; y: number; w: number; h: number } | null>(null);

  // Group drag state
  const groupDragRef = useRef<{
    groupId: string;
    startPositions: Map<string, { x: number; y: number }>;
  } | null>(null);
  const dragGroupOffsetsRef = useRef<Map<string, { x: number; y: number }>>(new Map());

  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        const w = containerRef.current.offsetWidth;
        setDimensions({ width: w, height: Math.round(w * 0.75) });
      }
    };
    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  // --- Build table bounds helper (uses latest dimensions) ---
  const getBounds = useCallback(
    (t: VenueTable) => tableBounds(t, dimensions),
    [dimensions],
  );

  // ============================================================
  // Drag handlers
  // ============================================================

  const handleDragMove = useCallback(
    (e: KonvaEventObject<DragEvent>, tableId: string) => {
      const node = e.target;
      let newX = node.x();
      let newY = node.y();

      const draggedTable = tables.find((t) => t.id === tableId);
      if (!draggedTable) return;

      const fb = getTableDimensions(draggedTable.max_covers, draggedTable.shape);
      const dw = ((draggedTable.width ?? fb.width) / 100) * dimensions.width;
      const dh = ((draggedTable.height ?? fb.height) / 100) * dimensions.height;

      // -- Group drag: initialise on first move --
      if (draggedTable.snap_group_id && !groupDragRef.current) {
        const starts = new Map<string, { x: number; y: number }>();
        for (const t of tables) {
          if (t.snap_group_id === draggedTable.snap_group_id) {
            const b = getBounds(t);
            starts.set(t.id, { x: b.x, y: b.y });
          }
        }
        groupDragRef.current = {
          groupId: draggedTable.snap_group_id,
          startPositions: starts,
        };
      }

      // -- Group drag: apply delta to group members --
      if (groupDragRef.current) {
        const startPos = groupDragRef.current.startPositions.get(tableId);
        if (startPos) {
          const dx = newX - startPos.x;
          const dy = newY - startPos.y;
          for (const [id, sp] of groupDragRef.current.startPositions) {
            if (id !== tableId) {
              dragGroupOffsetsRef.current.set(id, { x: sp.x + dx, y: sp.y + dy });
            }
          }
        }
      }

      // -- Snap-join detection (only when join-snap is enabled) --
      const allBounds: SnapTableBounds[] = tables.map((t) => {
        const offset = dragGroupOffsetsRef.current.get(t.id);
        return toSnapBounds(t, dimensions, t.id === tableId ? { x: newX, y: newY } : offset ? offset : undefined);
      });
      const draggedBounds = allBounds.find((b) => b.id === tableId)!;
      const snapRes = joinSnapEnabled ? detectSnap(draggedBounds, allBounds, SNAP_THRESHOLD) : null;

      let snapApplied = false;
      if (snapRes) {
        newX = snapRes.snapX;
        newY = snapRes.snapY;
        node.x(newX);
        node.y(newY);
        snapResultRef.current = snapRes;
        snapApplied = true;

        const target = allBounds.find((b) => b.id === snapRes.targetTableId)!;
        const tL = target.x - target.w / 2;
        const tR = target.x + target.w / 2;
        const tT = target.y - target.h / 2;
        const tB = target.y + target.h / 2;
        switch (snapRes.targetSide) {
          case 'left':   snapGuideEdgeRef.current = [tL, tT, tL, tB]; break;
          case 'right':  snapGuideEdgeRef.current = [tR, tT, tR, tB]; break;
          case 'top':    snapGuideEdgeRef.current = [tL, tT, tR, tT]; break;
          case 'bottom': snapGuideEdgeRef.current = [tL, tB, tR, tB]; break;
        }

        snapGhostRef.current = { x: newX, y: newY, w: dw, h: dh };

        if (groupDragRef.current) {
          const startPos = groupDragRef.current.startPositions.get(tableId);
          if (startPos) {
            const dx = newX - startPos.x;
            const dy = newY - startPos.y;
            for (const [id, sp] of groupDragRef.current.startPositions) {
              if (id !== tableId) {
                dragGroupOffsetsRef.current.set(id, { x: sp.x + dx, y: sp.y + dy });
              }
            }
          }
        }
      }

      if (!snapApplied) {
        snapResultRef.current = null;
        snapGuideEdgeRef.current = null;
        snapGhostRef.current = null;

        // -- Alignment guides: always compute visual guides, but only hard-snap position when enabled --
        const guides: Array<{ points: number[] }> = [];
        let snappedX = false;
        let snappedY = false;

        for (const other of tables) {
          if (other.id === tableId) continue;
          if (groupDragRef.current && groupDragRef.current.startPositions.has(other.id)) continue;

          const ob = getBounds(other);
          const obLeft = ob.x - ob.w / 2;
          const obRight = ob.x + ob.w / 2;
          const obTop = ob.y - ob.h / 2;
          const obBottom = ob.y + ob.h / 2;
          const dragLeft = newX - dw / 2;
          const dragRight = newX + dw / 2;
          const dragTop = newY - dh / 2;
          const dragBottom = newY + dh / 2;

          if (!snappedX) {
            if (Math.abs(dragRight - obLeft) < 15) {
              guides.push({ points: [obLeft, Math.min(dragTop, obTop) - 10, obLeft, Math.max(dragBottom, obBottom) + 10] });
              if (alignmentGuidesEnabled) { newX = obLeft + dw / 2; }
              snappedX = true;
            } else if (Math.abs(dragLeft - obRight) < 15) {
              guides.push({ points: [obRight, Math.min(dragTop, obTop) - 10, obRight, Math.max(dragBottom, obBottom) + 10] });
              if (alignmentGuidesEnabled) { newX = obRight - dw / 2; }
              snappedX = true;
            } else if (Math.abs(newX - ob.x) < 15) {
              guides.push({ points: [ob.x, Math.min(dragTop, obTop) - 10, ob.x, Math.max(dragBottom, obBottom) + 10] });
              if (alignmentGuidesEnabled) { newX = ob.x; }
              snappedX = true;
            }
          }
          if (!snappedY) {
            if (Math.abs(dragBottom - obTop) < 15) {
              guides.push({ points: [Math.min(dragLeft, obLeft) - 10, obTop, Math.max(dragRight, obRight) + 10, obTop] });
              if (alignmentGuidesEnabled) { newY = obTop + dh / 2; }
              snappedY = true;
            } else if (Math.abs(dragTop - obBottom) < 15) {
              guides.push({ points: [Math.min(dragLeft, obLeft) - 10, obBottom, Math.max(dragRight, obRight) + 10, obBottom] });
              if (alignmentGuidesEnabled) { newY = obBottom - dh / 2; }
              snappedY = true;
            } else if (Math.abs(newY - ob.y) < 15) {
              guides.push({ points: [Math.min(dragLeft, obLeft) - 10, ob.y, Math.max(dragRight, obRight) + 10, ob.y] });
              if (alignmentGuidesEnabled) { newY = ob.y; }
              snappedY = true;
            }
          }
        }

        node.x(newX);
        node.y(newY);
        snapGuidesRef.current = guides;
      }

      dragPosRef.current = { id: tableId, x: newX, y: newY };
      forceRender((c) => c + 1);
    },
    [tables, dimensions, getBounds, alignmentGuidesEnabled, joinSnapEnabled],
  );

  const handleDragEnd = useCallback(
    (e: KonvaEventObject<DragEvent>, tableId: string) => {
      const node = e.target;
      const rawX = node.x();
      const rawY = node.y();

      const finalPctX = pixelToPct(rawX, dimensions.width);
      const finalPctY = pixelToPct(rawY, dimensions.height);

      // -- Snap-join apply --
      if (snapResultRef.current && onSnapApply) {
        const allBounds = tables.map((t) => {
          const offset = dragGroupOffsetsRef.current.get(t.id);
          return toSnapBounds(t, dimensions, t.id === tableId ? { x: rawX, y: rawY } : offset ?? undefined);
        });

        // If dragged table was in a different group from the target, clean up old group first
        const draggedBounds = allBounds.find((b) => b.id === tableId)!;
        const targetBounds = allBounds.find((b) => b.id === snapResultRef.current!.targetTableId)!;
        if (
          draggedBounds.snap_group_id &&
          draggedBounds.snap_group_id !== targetBounds.snap_group_id &&
          onSnapRemove
        ) {
          const removeResult = removeFromSnapGroup(tableId, allBounds);
          onSnapRemove(removeResult, { id: tableId, x: finalPctX, y: finalPctY });
        }

        // Clear dragged table's old group data before building new group
        const cleanedBounds = allBounds.map((b) =>
          b.id === tableId ? { ...b, snap_group_id: null, snap_sides: null } : b,
        );
        const groupUpdate = buildSnapGroup(tableId, snapResultRef.current, cleanedBounds);

        const pctPositions = groupUpdate.tableUpdates.map((tu) => {
          if (tu.id === tableId) return { id: tu.id, x: finalPctX, y: finalPctY };
          const offset = dragGroupOffsetsRef.current.get(tu.id);
          const t = tables.find((tb) => tb.id === tu.id)!;
          return {
            id: tu.id,
            x: offset ? pixelToPct(offset.x, dimensions.width) : t.position_x ?? 50,
            y: offset ? pixelToPct(offset.y, dimensions.height) : t.position_y ?? 50,
          };
        });

        onSnapApply(groupUpdate, pctPositions);
      }
      // -- Group move (no snap change) --
      else if (groupDragRef.current && onGroupMove) {
        const moves: Array<{ id: string; x: number; y: number }> = [];
        for (const [id] of groupDragRef.current.startPositions) {
          if (id === tableId) {
            moves.push({ id, x: finalPctX, y: finalPctY });
          } else {
            const offset = dragGroupOffsetsRef.current.get(id);
            if (offset) {
              moves.push({
                id,
                x: pixelToPct(offset.x, dimensions.width),
                y: pixelToPct(offset.y, dimensions.height),
              });
            }
          }
        }
        onGroupMove(moves);
      }
      // -- Normal single move --
      else {
        onMove(tableId, finalPctX, finalPctY);
      }

      // Clear all drag state
      dragPosRef.current = null;
      snapGuidesRef.current = [];
      snapResultRef.current = null;
      snapGuideEdgeRef.current = null;
      snapGhostRef.current = null;
      groupDragRef.current = null;
      dragGroupOffsetsRef.current.clear();
      forceRender((c) => c + 1);
    },
    [tables, dimensions, onMove, onGroupMove, onSnapApply, onSnapRemove],
  );

  // ============================================================
  // Other handlers
  // ============================================================

  const handleStageClick = useCallback(
    (e: KonvaEventObject<MouseEvent | TouchEvent>) => {
      if (e.target === e.target.getStage()) onSelect(null);
    },
    [onSelect],
  );

  const handleWheel = useCallback(
    (e: KonvaEventObject<WheelEvent>) => {
      e.evt.preventDefault();
      const stage = stageRef.current;
      if (!stage) return;
      const pointer = stage.getPointerPosition();
      if (!pointer) return;
      const mousePointTo = {
        x: (pointer.x - stagePos.x) / scale,
        y: (pointer.y - stagePos.y) / scale,
      };
      const direction = e.evt.deltaY > 0 ? -1 : 1;
      const newScale = Math.max(0.3, Math.min(3, scale + direction * 0.1));
      setScale(newScale);
      setStagePos({
        x: pointer.x - mousePointTo.x * newScale,
        y: pointer.y - mousePointTo.y * newScale,
      });
    },
    [scale, stagePos],
  );

  const resetView = useCallback(() => {
    const fit = computeStageFitToView(tables, dimensions.width, dimensions.height);
    setScale(fit.scale);
    setStagePos({ x: fit.x, y: fit.y });
  }, [tables, dimensions.width, dimensions.height]);

  const initialFitDone = useRef(false);
  useEffect(() => {
    if (!initialFitDone.current && tables.length > 0 && dimensions.width > 1) {
      resetView();
      initialFitDone.current = true;
    }
  }, [tables, dimensions.width, dimensions.height, resetView]);

  const zoomBy = useCallback(
    (delta: number) => {
      const newScale = Math.max(0.3, Math.min(3, scale + delta));
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

  const handleSplit = useCallback(
    (ejectTableId: string, ejectedSide: string) => {
      if (!onSnapRemove) return;

      const ejectedTable = tables.find((t) => t.id === ejectTableId);
      if (!ejectedTable) return;

      const separationPx = SNAP_THRESHOLD + 5;
      const b = getBounds(ejectedTable);
      let newX = b.x;
      let newY = b.y;

      switch (ejectedSide) {
        case 'right':  newX -= separationPx; break;
        case 'left':   newX += separationPx; break;
        case 'bottom': newY -= separationPx; break;
        case 'top':    newY += separationPx; break;
      }

      const allBounds = tables.map((t) => toSnapBounds(t, dimensions));
      const removeResult = removeFromSnapGroup(ejectTableId, allBounds);

      onSnapRemove(removeResult, {
        id: ejectTableId,
        x: pixelToPct(newX, dimensions.width),
        y: pixelToPct(newY, dimensions.height),
      });
    },
    [tables, dimensions, getBounds, onSnapRemove],
  );

  // ============================================================
  // Computed values
  // ============================================================

  // Adjacency (for real-time seat hiding)
  const adjacency = (() => {
    const dp = dragPosRef.current;
    const bounds = tables.map((t) => {
      const fb = getTableDimensions(t.max_covers, t.shape);
      const isDrag = dp?.id === t.id;
      const offset = dragGroupOffsetsRef.current.get(t.id);
      return {
        id: t.id,
        x: isDrag ? dp!.x : offset ? offset.x : pctToPixel(t.position_x, dimensions.width),
        y: isDrag ? dp!.y : offset ? offset.y : pctToPixel(t.position_y, dimensions.height),
        w: ((t.width ?? fb.width) / 100) * dimensions.width,
        h: ((t.height ?? fb.height) / 100) * dimensions.height,
      };
    });
    return computeTableAdjacency(bounds);
  })();

  // Snap groups for combined outlines and labels
  const snapGroups = (() => {
    const groups = new Map<string, VenueTable[]>();
    for (const t of tables) {
      if (!t.snap_group_id) continue;
      if (!groups.has(t.snap_group_id)) groups.set(t.snap_group_id, []);
      groups.get(t.snap_group_id)!.push(t);
    }
    const result: Array<{
      groupId: string;
      tables: VenueTable[];
      outline: number[];
      label: string;
      labelX: number;
      labelY: number;
    }> = [];

    groups.forEach((groupTables, groupId) => {
      if (groupTables.length < 2) return;
      const boundsArr = groupTables.map((t) => {
        const dp = dragPosRef.current;
        const isDrag = dp?.id === t.id;
        const offset = dragGroupOffsetsRef.current.get(t.id);
        const b = getBounds(t);
        return {
          x: isDrag ? dp!.x : offset ? offset.x : b.x,
          y: isDrag ? dp!.y : offset ? offset.y : b.y,
          w: b.w,
          h: b.h,
        };
      });
      const outline = calculateGroupOutline(boundsArr);
      const label = groupTables.map((t) => t.name).join(' + ');

      const minX = Math.min(...boundsArr.map((b) => b.x - b.w / 2));
      const maxX = Math.max(...boundsArr.map((b) => b.x + b.w / 2));
      const minY = Math.min(...boundsArr.map((b) => b.y - b.h / 2));

      result.push({
        groupId,
        tables: groupTables,
        outline,
        label,
        labelX: (minX + maxX) / 2,
        labelY: minY - 22,
      });
    });

    return result;
  })();

  // Join pairs for split buttons (only when not dragging)
  const joinPairs = (() => {
    if (dragPosRef.current) return [];
    const pairs: Array<{
      tableA: VenueTable;
      tableB: VenueTable;
      aSide: string;
      bSide: string;
      midX: number;
      midY: number;
    }> = [];

    for (const group of snapGroups) {
      for (let i = 0; i < group.tables.length; i++) {
        for (let j = i + 1; j < group.tables.length; j++) {
          const a = group.tables[i]!;
          const b = group.tables[j]!;
          const ab = getBounds(a);
          const bb = getBounds(b);
          const tol = 4;

          const aR = ab.x + ab.w / 2, aL = ab.x - ab.w / 2;
          const aT = ab.y - ab.h / 2, aB = ab.y + ab.h / 2;
          const bR = bb.x + bb.w / 2, bL = bb.x - bb.w / 2;
          const bT = bb.y - bb.h / 2, bB = bb.y + bb.h / 2;

          if (Math.abs(aR - bL) < tol) {
            const top = Math.max(aT, bT), bot = Math.min(aB, bB);
            if (bot > top) pairs.push({ tableA: a, tableB: b, aSide: 'right', bSide: 'left', midX: aR, midY: (top + bot) / 2 });
          } else if (Math.abs(aL - bR) < tol) {
            const top = Math.max(aT, bT), bot = Math.min(aB, bB);
            if (bot > top) pairs.push({ tableA: b, tableB: a, aSide: 'right', bSide: 'left', midX: aL, midY: (top + bot) / 2 });
          } else if (Math.abs(aB - bT) < tol) {
            const left = Math.max(aL, bL), right = Math.min(aR, bR);
            if (right > left) pairs.push({ tableA: a, tableB: b, aSide: 'bottom', bSide: 'top', midX: (left + right) / 2, midY: aB });
          } else if (Math.abs(aT - bB) < tol) {
            const left = Math.max(aL, bL), right = Math.min(aR, bR);
            if (right > left) pairs.push({ tableA: b, tableB: a, aSide: 'bottom', bSide: 'top', midX: (left + right) / 2, midY: bB });
          }
        }
      }
    }

    return pairs;
  })();

  // ============================================================
  // Render
  // ============================================================

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        position: 'relative',
        backgroundImage: backgroundUrl ? `url(${backgroundUrl})` : undefined,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
      }}
    >
      <div className="absolute right-2 top-2 z-10 flex gap-1">
        <button
          type="button"
          onClick={() => zoomBy(0.2)}
          className="flex h-7 w-7 items-center justify-center rounded border border-slate-300 bg-white text-sm text-slate-600 hover:bg-slate-50"
          title="Zoom in"
        >+</button>
        <button
          type="button"
          onClick={() => zoomBy(-0.2)}
          className="flex h-7 w-7 items-center justify-center rounded border border-slate-300 bg-white text-sm text-slate-600 hover:bg-slate-50"
          title="Zoom out"
        >−</button>
        <button
          type="button"
          onClick={resetView}
          className="flex h-7 min-w-[2.75rem] items-center justify-center rounded border border-slate-300 bg-white px-2 text-xs text-slate-600 hover:bg-slate-50"
          title="Fit entire floor plan to this view (same as filling the canvas)"
        >{Math.round(scale * 100)}%</button>
      </div>

      <Stage
        ref={(node) => { stageRef.current = node; }}
        width={dimensions.width}
        height={dimensions.height}
        scaleX={scale}
        scaleY={scale}
        x={stagePos.x}
        y={stagePos.y}
        onClick={handleStageClick}
        onTap={handleStageClick}
        onWheel={handleWheel}
        draggable={!(selectedIds?.length ?? (selectedId ? 1 : 0))}
        onDragEnd={(e) => {
          if (e.target === e.target.getStage()) {
            setStagePos({ x: e.target.x(), y: e.target.y() });
          }
        }}
        style={{ background: backgroundUrl ? 'rgba(248,250,252,0.55)' : '#f8fafc', cursor: 'default' }}
      >
        <Layer>
          {/* ---- Combined outlines & labels for snap groups (hidden during drag) ---- */}
          {!dragPosRef.current && snapGroups.map((g) => (
            <Line
              key={`outline-${g.groupId}`}
              points={g.outline}
              stroke="#374151"
              strokeWidth={1.5}
              closed
              opacity={0.45}
              dash={[6, 3]}
              listening={false}
              perfectDrawEnabled={false}
            />
          ))}

          {!dragPosRef.current && snapGroups.map((g) => (
            <Text
              key={`label-${g.groupId}`}
              text={g.label}
              x={g.labelX - 96}
              y={g.labelY}
              width={192}
              align="center"
              fontSize={12}
              fontFamily="Inter, system-ui, sans-serif"
              fontStyle="600"
              fill="#374151"
              listening={false}
            />
          ))}

          {/* ---- Tables ---- */}
          {tables.map((table) => {
            const isDragging = dragPosRef.current?.id === table.id;
            const groupOffset = dragGroupOffsetsRef.current.get(table.id);
            const isSelected = (selectedIds ?? []).includes(table.id) || table.id === selectedId;
            const color = getZoneColor(table.zone);
            const blocked = adjacency.get(table.id);
            const hidden = blockedToHiddenSet(blocked);

            return (
              <TableShape
                key={table.id}
                table={table}
                hiddenSides={hidden}
                isSelected={isSelected}
                isEditorMode
                statusColour={color}
                booking={null}
                canvasWidth={dimensions.width}
                canvasHeight={dimensions.height}
                overrideX={isDragging ? dragPosRef.current!.x : groupOffset?.x}
                overrideY={isDragging ? dragPosRef.current!.y : groupOffset?.y}
                onDragMove={(e) => handleDragMove(e, table.id)}
                onDragEnd={(e) => handleDragEnd(e, table.id)}
                onClick={(e) => onSelect(table.id, e.evt.shiftKey)}
                onTap={() => onSelect(table.id, false)}
              />
            );
          })}

          {/* ---- Combination link lines (manual combinations) ---- */}
          {(combinationLinks ?? []).map((combo) => {
            const pts: number[] = [];
            for (const tid of combo.tableIds) {
              const t = tables.find((tb) => tb.id === tid);
              if (!t) continue;
              const dp = dragPosRef.current;
              const isDrag = dp?.id === tid;
              pts.push(isDrag ? dp!.x : pctToPixel(t.position_x, dimensions.width));
              pts.push(isDrag ? dp!.y : pctToPixel(t.position_y, dimensions.height));
            }
            if (pts.length < 4) return null;
            return (
              <Line
                key={`combo-${combo.id}`}
                points={pts}
                stroke="#8b5cf6"
                strokeWidth={2.5}
                dash={[6, 4]}
                opacity={0.6}
              />
            );
          })}

          {/* ---- Snap-join guide: blue edge highlight ---- */}
          {snapGuideEdgeRef.current && (
            <Line
              points={snapGuideEdgeRef.current}
              stroke="#3B82F6"
              strokeWidth={3}
              dash={[6, 3]}
            />
          )}

          {/* ---- Snap ghost outline ---- */}
          {snapGhostRef.current && (
            <Rect
              x={snapGhostRef.current.x - snapGhostRef.current.w / 2}
              y={snapGhostRef.current.y - snapGhostRef.current.h / 2}
              width={snapGhostRef.current.w}
              height={snapGhostRef.current.h}
              stroke="#3B82F6"
              strokeWidth={1.5}
              dash={[4, 4]}
              fill="rgba(59,130,246,0.08)"
              cornerRadius={8}
              listening={false}
            />
          )}

          {/* ---- Split buttons on join lines ---- */}
          {joinPairs.map((pair, i) => {
            const aCount = pair.tableA.snap_sides?.length ?? 0;
            const bCount = pair.tableB.snap_sides?.length ?? 0;
            const ejectId = aCount <= bCount ? pair.tableA.id : pair.tableB.id;
            const ejectSide = ejectId === pair.tableA.id ? pair.aSide : pair.bSide;

            return (
              <Group
                key={`split-${i}`}
                x={pair.midX}
                y={pair.midY}
                onClick={(e: KonvaEventObject<MouseEvent>) => {
                  e.cancelBubble = true;
                  handleSplit(ejectId, ejectSide);
                }}
                onTap={() => handleSplit(ejectId, ejectSide)}
              >
                <Circle
                  radius={10}
                  fill="#ffffff"
                  stroke="#cbd5e1"
                  strokeWidth={1.5}
                  shadowColor="rgba(0,0,0,0.12)"
                  shadowBlur={3}
                  shadowOffsetY={1}
                />
                <Line points={[-3.5, -3.5, 3.5, 3.5]} stroke="#ef4444" strokeWidth={2} lineCap="round" />
                <Line points={[-3.5, 3.5, 3.5, -3.5]} stroke="#ef4444" strokeWidth={2} lineCap="round" />
              </Group>
            );
          })}

          {/* ---- Standard alignment guides ---- */}
          {snapGuidesRef.current.map((guide, i) => (
            <Line
              key={`guide-${i}`}
              points={guide.points}
              stroke="#3b82f6"
              strokeWidth={1}
              dash={[4, 4]}
            />
          ))}
        </Layer>
      </Stage>
    </div>
  );
}
