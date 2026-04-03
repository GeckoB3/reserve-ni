'use client';

import { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { Stage, Layer, Line, Rect, Text, Circle } from 'react-konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import type Konva from 'konva';
import { computeTableAdjacency, getTableDimensions } from '@/types/table-management';
import { computeStageFitToView } from '@/lib/floor-plan/fit-view';
import type { BlockedSides } from '@/types/table-management';
import TableShape from '@/components/floor-plan/TableShape';

/**
 * Stat tile label colours from `DashboardStatCard` (Tailwind `text-blue-700` / `text-emerald-700`).
 * TableShape lightens the fill from these bases; strokes use the base hex directly.
 */
const STAT_TILE_TEXT_BLUE_700 = '#1d4ed8';
const STAT_TILE_TEXT_EMERALD_700 = '#047857';

const STATUS_COLORS: Record<string, string> = {
  available: STAT_TILE_TEXT_EMERALD_700,
  booked: STAT_TILE_TEXT_BLUE_700,
  pending: STAT_TILE_TEXT_BLUE_700,
  reserved: STAT_TILE_TEXT_BLUE_700,
  seated: STAT_TILE_TEXT_BLUE_700,
  held: STAT_TILE_TEXT_BLUE_700,
  no_show: STAT_TILE_TEXT_BLUE_700,
  starters: STAT_TILE_TEXT_BLUE_700,
  mains: STAT_TILE_TEXT_BLUE_700,
  dessert: STAT_TILE_TEXT_BLUE_700,
  bill: STAT_TILE_TEXT_BLUE_700,
  paid: STAT_TILE_TEXT_BLUE_700,
  bussing: STAT_TILE_TEXT_BLUE_700,
};

/** Valid drop target - amber reads on both emerald-tinted empty and blue-tinted occupied fills */
const VALID_TARGET_COLOR = '#d97706';
const DRAG_GHOST_OPACITY = 0.35;

const EMPTY_HIDDEN_SET = new Set<string>();
function blockedToHiddenSet(blocked?: BlockedSides): Set<string> {
  if (!blocked) return EMPTY_HIDDEN_SET;
  const s = new Set<string>();
  if (blocked.top) s.add('top');
  if (blocked.right) s.add('right');
  if (blocked.bottom) s.add('bottom');
  if (blocked.left) s.add('left');
  return s.size > 0 ? s : EMPTY_HIDDEN_SET;
}

interface TableWithState {
  id: string;
  name: string;
  min_covers: number;
  max_covers: number;
  shape: string;
  zone: string | null;
  position_x: number | null;
  position_y: number | null;
  width: number | null;
  height: number | null;
  rotation: number | null;
  service_status: string;
  booking: {
    id: string;
    guest_name: string;
    party_size: number;
  } | null;
  elapsed_pct: number;
}

interface DefinedCombination {
  id: string;
  name: string;
  tableIds: string[];
}

export interface FloorDragEvent {
  bookingId: string;
  sourceTableIds: string[];
  targetTableId: string;
}

interface Props {
  tables: TableWithState[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  combinedTableGroups?: Map<string, string[]>;
  definedCombinations?: DefinedCombination[];
  validDropTargets?: Set<string> | null;
  validDropComboLabels?: Map<string, string> | null;
  reassignMode?: { bookingId: string; guestName: string } | null;
  onDragStart?: (bookingId: string, sourceTableIds: string[]) => void;
  onDragEnd?: (event: FloorDragEvent) => void;
  onDragCancel?: () => void;
}

export default function LiveFloorCanvas({
  tables,
  selectedId,
  onSelect,
  combinedTableGroups,
  definedCombinations,
  validDropTargets,
  validDropComboLabels,
  reassignMode,
  onDragStart,
  onDragEnd,
  onDragCancel,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage | null>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [scale, setScale] = useState(1);
  const [stagePos, setStagePos] = useState({ x: 0, y: 0 });
  const baseScaleRef = useRef(1);
  const [draggingBookingId, setDraggingBookingId] = useState<string | null>(null);
  const [dragPointer, setDragPointer] = useState<{ x: number; y: number } | null>(null);
  const dragStartPosRef = useRef<{ x: number; y: number } | null>(null);
  const isDraggingRef = useRef(false);

  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        const w = containerRef.current.offsetWidth;
        const h = containerRef.current.offsetHeight || Math.min(Math.round(w * 0.75), window.innerHeight - 200);
        setDimensions({ width: Math.max(1, w), height: Math.max(1, h) });
      }
    };
    updateSize();
    window.addEventListener('resize', updateSize);
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(updateSize) : null;
    if (ro && containerRef.current) ro.observe(containerRef.current);
    return () => {
      window.removeEventListener('resize', updateSize);
      ro?.disconnect();
    };
  }, []);

  const handleStageClick = useCallback((e: KonvaEventObject<MouseEvent | TouchEvent>) => {
    if (isDraggingRef.current) return;
    if (e.target === e.target.getStage()) {
      if (draggingBookingId) {
        setDraggingBookingId(null);
        setDragPointer(null);
        isDraggingRef.current = false;
        onDragCancel?.();
      } else {
        onSelect(null);
      }
    }
  }, [onSelect, draggingBookingId, onDragCancel]);

  const handleWheel = useCallback((e: KonvaEventObject<WheelEvent>) => {
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
  }, [scale, stagePos]);

  const adjacency = useMemo(() => {
    const bounds = tables.map((t) => {
      const fallback = getTableDimensions(t.max_covers, t.shape);
      return {
        id: t.id,
        x: t.position_x != null ? (t.position_x / 100) * dimensions.width : dimensions.width / 2,
        y: t.position_y != null ? (t.position_y / 100) * dimensions.height : dimensions.height / 2,
        w: ((t.width ?? fallback.width) / 100) * dimensions.width,
        h: ((t.height ?? fallback.height) / 100) * dimensions.height,
      };
    });
    return computeTableAdjacency(bounds);
  }, [tables, dimensions]);

  const combinationLines = useCallback(() => {
    if (!combinedTableGroups) return [];
    const lines: Array<{ key: string; points: number[] }> = [];

    combinedTableGroups.forEach((tableIds, bookingId) => {
      if (tableIds.length < 2) return;
      for (let i = 0; i < tableIds.length - 1; i++) {
        const t1 = tables.find((t) => t.id === tableIds[i]);
        const t2 = tables.find((t) => t.id === tableIds[i + 1]);
        if (!t1 || !t2) continue;
        const x1 = t1.position_x != null ? (t1.position_x / 100) * dimensions.width : dimensions.width / 2;
        const y1 = t1.position_y != null ? (t1.position_y / 100) * dimensions.height : dimensions.height / 2;
        const x2 = t2.position_x != null ? (t2.position_x / 100) * dimensions.width : dimensions.width / 2;
        const y2 = t2.position_y != null ? (t2.position_y / 100) * dimensions.height : dimensions.height / 2;
        lines.push({ key: `${bookingId}-${i}`, points: [x1, y1, x2, y2] });
      }
    });

    return lines;
  }, [combinedTableGroups, tables, dimensions]);

  const handleTableMouseDown = useCallback((tableId: string, _e: KonvaEventObject<MouseEvent | TouchEvent>) => {
    const table = tables.find((t) => t.id === tableId);
    if (!table?.booking) return;

    const stage = stageRef.current;
    if (!stage) return;
    const pointer = stage.getPointerPosition();
    if (!pointer) return;

    dragStartPosRef.current = { x: pointer.x, y: pointer.y };
  }, [tables]);

  const handleTableMouseMove = useCallback((tableId: string) => {
    if (!dragStartPosRef.current) return;
    const stage = stageRef.current;
    if (!stage) return;
    const pointer = stage.getPointerPosition();
    if (!pointer) return;

    const dx = pointer.x - dragStartPosRef.current.x;
    const dy = pointer.y - dragStartPosRef.current.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist > 8 && !isDraggingRef.current) {
      isDraggingRef.current = true;
      const table = tables.find((t) => t.id === tableId);
      if (table?.booking) {
        const bookingId = table.booking.id;
        const sourceTableIds = combinedTableGroups?.get(bookingId) ?? [tableId];
        setDraggingBookingId(bookingId);
        onDragStart?.(bookingId, sourceTableIds);
      }
    }

    if (isDraggingRef.current) {
      setDragPointer({
        x: (pointer.x - stagePos.x) / scale,
        y: (pointer.y - stagePos.y) / scale,
      });
    }
  }, [tables, combinedTableGroups, onDragStart, scale, stagePos]);

  const handleTableMouseUp = useCallback((tableId: string) => {
    if (isDraggingRef.current && draggingBookingId) {
      const sourceTableIds = combinedTableGroups?.get(draggingBookingId) ?? [];
      if (!sourceTableIds.includes(tableId) && validDropTargets?.has(tableId)) {
        onDragEnd?.({
          bookingId: draggingBookingId,
          sourceTableIds,
          targetTableId: tableId,
        });
      } else {
        onDragCancel?.();
      }
      setDraggingBookingId(null);
      setDragPointer(null);
      isDraggingRef.current = false;
      dragStartPosRef.current = null;
      return;
    }

    dragStartPosRef.current = null;
    isDraggingRef.current = false;
  }, [combinedTableGroups, draggingBookingId, validDropTargets, onDragEnd, onDragCancel]);

  const handleStageMouseUp = useCallback(() => {
    if (isDraggingRef.current && draggingBookingId) {
      onDragCancel?.();
      setDraggingBookingId(null);
      setDragPointer(null);
    }
    isDraggingRef.current = false;
    dragStartPosRef.current = null;
  }, [draggingBookingId, onDragCancel]);

  const handleStageMouseMove = useCallback(() => {
    if (!isDraggingRef.current || !dragStartPosRef.current) return;
    const stage = stageRef.current;
    if (!stage) return;
    const pointer = stage.getPointerPosition();
    if (!pointer) return;

    setDragPointer({
      x: (pointer.x - stagePos.x) / scale,
      y: (pointer.y - stagePos.y) / scale,
    });
  }, [scale, stagePos]);

  const fitViewToStage = useCallback(() => {
    const fit = computeStageFitToView(tables, dimensions.width, dimensions.height);
    baseScaleRef.current = fit.scale;
    setScale(fit.scale);
    setStagePos({ x: fit.x, y: fit.y });
  }, [tables, dimensions.width, dimensions.height]);

  const initialFitDone = useRef(false);
  const prevDimensions = useRef({ width: 0, height: 0 });
  useEffect(() => {
    if (tables.length === 0 || dimensions.width <= 1) return;
    if (!initialFitDone.current) {
      fitViewToStage();
      initialFitDone.current = true;
      prevDimensions.current = { width: dimensions.width, height: dimensions.height };
      return;
    }
    const dw = Math.abs(dimensions.width - prevDimensions.current.width);
    const dh = Math.abs(dimensions.height - prevDimensions.current.height);
    if (dw > 50 || dh > 50) {
      fitViewToStage();
      prevDimensions.current = { width: dimensions.width, height: dimensions.height };
    }
  }, [tables, dimensions.width, dimensions.height, fitViewToStage]);

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

  const isDragging = draggingBookingId != null || reassignMode != null;
  const activeBookingId = draggingBookingId ?? reassignMode?.bookingId ?? null;

  return (
    <div ref={containerRef} className="h-full w-full" style={{ position: 'relative', touchAction: 'none' }}>
      <div className="absolute right-2 top-2 z-10 flex gap-1">
        <button
          type="button"
          onClick={() => zoomBy(0.2)}
          className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-300 bg-white text-base text-slate-600 shadow-sm hover:bg-slate-50 sm:h-9 sm:w-9 sm:text-sm"
          aria-label="Zoom in"
        >+</button>
        <button
          type="button"
          onClick={() => zoomBy(-0.2)}
          className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-300 bg-white text-base text-slate-600 shadow-sm hover:bg-slate-50 sm:h-9 sm:w-9 sm:text-sm"
          aria-label="Zoom out"
        >−</button>
        <button
          type="button"
          onClick={fitViewToStage}
          className="flex h-10 min-w-[3rem] items-center justify-center rounded-lg border border-slate-300 bg-white px-2 text-xs font-medium text-slate-600 shadow-sm hover:bg-slate-50 sm:h-9 sm:min-w-[2.75rem]"
          title="Fit entire floor plan to view"
        >{Math.round((baseScaleRef.current > 0 ? scale / baseScaleRef.current : scale) * 100)}%</button>
      </div>

      {isDragging && (
        <div className="absolute left-2 top-14 z-10 max-w-[calc(100%-4rem)] rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-800 shadow-sm sm:top-2 sm:px-3 sm:py-1.5 sm:text-xs">
          {draggingBookingId
            ? 'Drop on a highlighted table to reassign'
            : `Select destination for ${reassignMode?.guestName ?? 'booking'}`}
        </div>
      )}

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
        onMouseUp={handleStageMouseUp}
        onMouseMove={handleStageMouseMove}
        draggable={!isDraggingRef.current}
        onDragEnd={(e) => {
          if (e.target === e.target.getStage()) {
            setStagePos({ x: e.target.x(), y: e.target.y() });
          }
        }}
        style={{ background: '#f8fafc', cursor: isDragging ? 'grabbing' : undefined }}
      >
        <Layer>
          {/* Defined combination lines */}
          {(definedCombinations ?? []).map((combo) => {
            const pts: number[] = [];
            for (const tid of combo.tableIds) {
              const t = tables.find((tb) => tb.id === tid);
              if (!t) continue;
              pts.push(t.position_x != null ? (t.position_x / 100) * dimensions.width : dimensions.width / 2);
              pts.push(t.position_y != null ? (t.position_y / 100) * dimensions.height : dimensions.height / 2);
            }
            if (pts.length < 4) return null;
            return (
              <Line
                key={`def-combo-${combo.id}`}
                points={pts}
                stroke="#c4b5fd"
                strokeWidth={2}
                dash={[4, 4]}
                opacity={0.5}
              />
            );
          })}

          {/* Active booking combination lines */}
          {combinationLines().map((line) => (
            <Line
              key={line.key}
              points={line.points}
              stroke="#8b5cf6"
              strokeWidth={3}
              dash={[8, 4]}
              opacity={0.7}
            />
          ))}

          {/* Tables */}
          {tables.map((table) => {
            const isSelected = table.id === selectedId;
            const isSource = activeBookingId ? (combinedTableGroups?.get(activeBookingId)?.includes(table.id) ?? (table.booking?.id === activeBookingId)) : false;
            const isValidTarget = isDragging && validDropTargets?.has(table.id) && !isSource;
            const isInvalid = isDragging && !isSource && !validDropTargets?.has(table.id);
            const comboLabel = validDropComboLabels?.get(table.id);

            let statusColor = STATUS_COLORS[table.service_status] ?? STAT_TILE_TEXT_EMERALD_700;
            let opacity = 1;

            if (isDragging) {
              if (isValidTarget) {
                statusColor = VALID_TARGET_COLOR;
              } else if (isSource) {
                opacity = DRAG_GHOST_OPACITY;
              } else if (isInvalid) {
                opacity = 0.2;
              }
            }

            const blocked = adjacency.get(table.id);
            const hidden = blockedToHiddenSet(blocked);

            const fb = getTableDimensions(table.max_covers, table.shape);
            const w = ((table.width ?? fb.width) / 100) * dimensions.width;
            const h = ((table.height ?? fb.height) / 100) * dimensions.height;

            return (
              <TableShape
                key={table.id}
                table={table}
                hiddenSides={hidden}
                isSelected={isSelected || (isValidTarget ?? false)}
                isEditorMode={false}
                statusColour={statusColor}
                groupOpacity={opacity}
                booking={isDragging && isSource ? null : table.booking}
                canvasWidth={dimensions.width}
                canvasHeight={dimensions.height}
                onClick={() => {
                  if (isDragging && isValidTarget) {
                    if (draggingBookingId) {
                      const sourceTableIds = combinedTableGroups?.get(draggingBookingId) ?? [];
                      onDragEnd?.({
                        bookingId: draggingBookingId,
                        sourceTableIds,
                        targetTableId: table.id,
                      });
                      setDraggingBookingId(null);
                      setDragPointer(null);
                      isDraggingRef.current = false;
                      dragStartPosRef.current = null;
                    }
                    return;
                  }
                  if (!isDraggingRef.current) onSelect(table.id);
                }}
                onTap={() => {
                  if (isDragging && isValidTarget) {
                    if (draggingBookingId) {
                      const sourceTableIds = combinedTableGroups?.get(draggingBookingId) ?? [];
                      onDragEnd?.({
                        bookingId: draggingBookingId,
                        sourceTableIds,
                        targetTableId: table.id,
                      });
                      setDraggingBookingId(null);
                      setDragPointer(null);
                      isDraggingRef.current = false;
                      dragStartPosRef.current = null;
                    }
                    return;
                  }
                  onSelect(table.id);
                }}
              >
                {/* Valid target ring */}
                {isValidTarget && (
                  <>
                    {table.shape === 'circle' ? (
                      <Circle
                        x={0}
                        y={0}
                        radius={Math.max(w, h) / 2 + 6}
                        stroke={VALID_TARGET_COLOR}
                        strokeWidth={3}
                        dash={[6, 3]}
                        opacity={0.8}
                        listening={false}
                      />
                    ) : (
                      <Rect
                        x={-w / 2 - 6}
                        y={-h / 2 - 6}
                        width={w + 12}
                        height={h + 12}
                        cornerRadius={6}
                        stroke={VALID_TARGET_COLOR}
                        strokeWidth={3}
                        dash={[6, 3]}
                        opacity={0.8}
                        listening={false}
                      />
                    )}
                    {comboLabel && (
                      <Text
                        x={-72}
                        y={h / 2 + 10}
                        width={144}
                        align="center"
                        verticalAlign="middle"
                        text={comboLabel}
                        fontSize={12}
                        fill="#16a34a"
                        fontStyle="bold"
                        listening={false}
                      />
                    )}
                  </>
                )}

                {/* Drag initiation overlay (only on occupied tables, hidden during drag) */}
                {table.booking && !isDragging && (
                  <Rect
                    x={-w / 2}
                    y={-h / 2}
                    width={w}
                    height={h}
                    opacity={0}
                    onMouseDown={(e) => { e.cancelBubble = true; handleTableMouseDown(table.id, e); }}
                    onMouseMove={() => handleTableMouseMove(table.id)}
                    onMouseUp={() => handleTableMouseUp(table.id)}
                    onTouchStart={(e) => { e.cancelBubble = true; handleTableMouseDown(table.id, e); }}
                    onTouchMove={() => handleTableMouseMove(table.id)}
                    onTouchEnd={() => handleTableMouseUp(table.id)}
                  />
                )}

                {/* Drop-capture overlay (all tables during drag, catches mouseUp on target) */}
                {isDragging && !isSource && (
                  <Rect
                    x={-w / 2}
                    y={-h / 2}
                    width={w}
                    height={h}
                    opacity={0}
                    onMouseUp={() => handleTableMouseUp(table.id)}
                    onTouchEnd={() => handleTableMouseUp(table.id)}
                  />
                )}
              </TableShape>
            );
          })}

          {/* Drag cursor indicator */}
          {dragPointer && draggingBookingId && (
            <>
              <Circle
                x={dragPointer.x}
                y={dragPointer.y}
                radius={16}
                fill="#3b82f6"
                opacity={0.6}
                listening={false}
              />
              <Text
                x={dragPointer.x - 48}
                y={dragPointer.y + 18}
                width={96}
                align="center"
                verticalAlign="middle"
                text={(() => {
                  const b = tables.find((t) => t.booking?.id === draggingBookingId);
                  return b?.booking?.guest_name ?? '';
                })()}
                fontSize={12}
                fill="#1e40af"
                fontStyle="bold"
                listening={false}
              />
            </>
          )}
        </Layer>
      </Stage>
    </div>
  );
}
