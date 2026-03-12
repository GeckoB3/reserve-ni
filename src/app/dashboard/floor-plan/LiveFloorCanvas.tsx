'use client';

import { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { Stage, Layer, Line } from 'react-konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import type Konva from 'konva';
import { computeTableAdjacency, getTableDimensions } from '@/types/table-management';
import type { BlockedSides } from '@/types/table-management';
import TableShape from '@/components/floor-plan/TableShape';

const STATUS_COLORS: Record<string, string> = {
  available: '#22c55e',
  booked: '#14b8a6',
  pending: '#eab308',
  reserved: '#3b82f6',
  seated: '#10b981',
  held: '#6b7280',
  no_show: '#ef4444',
  starters: '#eab308',
  mains: '#f97316',
  dessert: '#ec4899',
  bill: '#8b5cf6',
  paid: '#64748b',
  bussing: '#94a3b8',
};

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

interface Props {
  tables: TableWithState[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  combinedTableGroups?: Map<string, string[]>;
  definedCombinations?: DefinedCombination[];
}

export default function LiveFloorCanvas({ tables, selectedId, onSelect, combinedTableGroups, definedCombinations }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage | null>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [scale, setScale] = useState(1);
  const [stagePos, setStagePos] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        const w = containerRef.current.offsetWidth;
        const h = containerRef.current.offsetHeight || Math.round(w * 0.75);
        setDimensions({ width: w, height: h });
      }
    };
    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  const handleStageClick = useCallback((e: KonvaEventObject<MouseEvent | TouchEvent>) => {
    if (e.target === e.target.getStage()) {
      onSelect(null);
    }
  }, [onSelect]);

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

  return (
    <div ref={containerRef} className="h-full w-full" style={{ position: 'relative' }}>
      <div className="absolute right-2 top-2 z-10 flex gap-1">
        <button
          onClick={() => setScale((s) => Math.min(3, s + 0.2))}
          className="flex h-7 w-7 items-center justify-center rounded border border-slate-300 bg-white text-sm text-slate-600 hover:bg-slate-50"
        >+</button>
        <button
          onClick={() => setScale((s) => Math.max(0.3, s - 0.2))}
          className="flex h-7 w-7 items-center justify-center rounded border border-slate-300 bg-white text-sm text-slate-600 hover:bg-slate-50"
        >−</button>
        <button
          onClick={() => { setScale(1); setStagePos({ x: 0, y: 0 }); }}
          className="flex h-7 items-center justify-center rounded border border-slate-300 bg-white px-2 text-xs text-slate-600 hover:bg-slate-50"
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
        draggable
        onDragEnd={(e) => {
          if (e.target === e.target.getStage()) {
            setStagePos({ x: e.target.x(), y: e.target.y() });
          }
        }}
        style={{ background: '#f8fafc' }}
      >
        <Layer>
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

          {tables.map((table) => {
            const isSelected = table.id === selectedId;
            const statusColor = STATUS_COLORS[table.service_status] ?? '#64748b';
            const blocked = adjacency.get(table.id);
            const hidden = blockedToHiddenSet(blocked);

            return (
              <TableShape
                key={table.id}
                table={table}
                hiddenSides={hidden}
                isSelected={isSelected}
                isEditorMode={false}
                statusColour={statusColor}
                booking={table.booking}
                canvasWidth={dimensions.width}
                canvasHeight={dimensions.height}
                onClick={() => onSelect(table.id)}
                onTap={() => onSelect(table.id)}
              />
            );
          })}
        </Layer>
      </Stage>
    </div>
  );
}
