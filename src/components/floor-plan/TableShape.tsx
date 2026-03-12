'use client';

import React, { useMemo } from 'react';
import { Group, Rect, Circle, Ellipse, Text } from 'react-konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import { getTableDimensions } from '@/types/table-management';
import { calculateSeatPositions } from '@/lib/floor-plan/seat-positions';

const SEAT_DOT_RADIUS = 6;
const SEAT_DOT_OFFSET = 12;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Minimal table data needed for rendering. */
export interface TableRenderData {
  name: string;
  min_covers: number;
  max_covers: number;
  shape: string;
  position_x: number | null;
  position_y: number | null;
  width: number | null;
  height: number | null;
  rotation: number | null;
}

export interface BookingInfo {
  id: string;
  guest_name: string;
  party_size: number;
}

export interface TableShapeProps {
  table: TableRenderData;
  hiddenSides: Set<string>;
  isSelected: boolean;
  isEditorMode: boolean;
  statusColour: string;
  booking: BookingInfo | null;
  canvasWidth: number;
  canvasHeight: number;
  /** Override the computed pixel position during drag. */
  overrideX?: number;
  overrideY?: number;
  onDragEnd?: (e: KonvaEventObject<DragEvent>) => void;
  onDragMove?: (e: KonvaEventObject<DragEvent>) => void;
  onClick?: (e: KonvaEventObject<MouseEvent>) => void;
  onTap?: () => void;
  children?: React.ReactNode;
}

// ---------------------------------------------------------------------------
// Colour helpers
// ---------------------------------------------------------------------------

function lightenHex(hex: string, amount = 0.85): string {
  const c = hex.replace('#', '');
  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);
  return `rgb(${Math.round(r + (255 - r) * amount)},${Math.round(g + (255 - g) * amount)},${Math.round(b + (255 - b) * amount)})`;
}

function darkenHex(hex: string, amount = 0.15): string {
  const c = hex.replace('#', '');
  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);
  return `rgb(${Math.round(r * (1 - amount))},${Math.round(g * (1 - amount))},${Math.round(b * (1 - amount))})`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function TableShape({
  table,
  hiddenSides,
  isSelected,
  isEditorMode,
  statusColour,
  booking,
  canvasWidth,
  canvasHeight,
  overrideX,
  overrideY,
  onDragEnd,
  onDragMove,
  onClick,
  onTap,
  children,
}: TableShapeProps) {
  // --- Geometry ---
  const fallback = getTableDimensions(table.max_covers, table.shape);
  const x =
    overrideX ??
    (table.position_x != null
      ? (table.position_x / 100) * canvasWidth
      : canvasWidth / 2);
  const y =
    overrideY ??
    (table.position_y != null
      ? (table.position_y / 100) * canvasHeight
      : canvasHeight / 2);
  const w = ((table.width ?? fallback.width) / 100) * canvasWidth;
  const h = ((table.height ?? fallback.height) / 100) * canvasHeight;

  const isOccupied = !isEditorMode && booking != null;

  // Stabilise the Set dependency for useMemo
  const hiddenKey = useMemo(
    () => Array.from(hiddenSides).sort().join(','),
    [hiddenSides],
  );

  const seats = useMemo(
    () =>
      calculateSeatPositions(
        table.shape,
        w,
        h,
        table.max_covers,
        hiddenSides.size > 0 ? hiddenSides : undefined,
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [table.shape, w, h, table.max_covers, hiddenKey],
  );

  // --- Appearance ---
  const fill = isEditorMode ? '#ffffff' : lightenHex(statusColour, 0.88);
  const stroke = isSelected ? '#2563eb' : statusColour;
  const strokeWidth = isSelected ? 2.5 : 1.5;

  const capacityText =
    table.min_covers === table.max_covers
      ? `${table.max_covers}`
      : `${table.min_covers}-${table.max_covers}`;
  const topLabel = isOccupied
    ? booking!.guest_name.slice(0, 12)
    : table.name;
  const bottomLabel = isOccupied
    ? `${booking!.party_size} pax`
    : capacityText;

  const isCircular = table.shape === 'circle';
  const isOval = table.shape === 'oval';

  const HANDLE = 6;

  return (
    <Group
      x={x}
      y={y}
      rotation={table.rotation ?? 0}
      draggable={isEditorMode}
      onDragEnd={onDragEnd}
      onDragMove={onDragMove}
      onClick={onClick}
      onTap={onTap}
    >
      {/* ---- Table body ---- */}
      {isCircular ? (
        <Circle
          radius={Math.min(w, h) / 2}
          fill={fill}
          stroke={stroke}
          strokeWidth={strokeWidth}
          shadowColor="rgba(0,0,0,0.15)"
          shadowBlur={4}
          shadowOffsetY={1}
        />
      ) : isOval ? (
        <Ellipse
          radiusX={w / 2}
          radiusY={h / 2}
          fill={fill}
          stroke={stroke}
          strokeWidth={strokeWidth}
          shadowColor="rgba(0,0,0,0.15)"
          shadowBlur={4}
          shadowOffsetY={1}
        />
      ) : (
        <Rect
          x={-w / 2}
          y={-h / 2}
          width={w}
          height={h}
          fill={fill}
          stroke={stroke}
          strokeWidth={strokeWidth}
          cornerRadius={8}
          shadowColor="rgba(0,0,0,0.15)"
          shadowBlur={4}
          shadowOffsetY={1}
        />
      )}

      {/* ---- Seat dots ---- */}
      {seats.map((seat, i) => {
        const dotX = seat.x + SEAT_DOT_OFFSET * Math.cos(seat.angle);
        const dotY = seat.y + SEAT_DOT_OFFSET * Math.sin(seat.angle);
        const isFilled = isOccupied && i < booking!.party_size;

        return (
          <Circle
            key={`seat-${seat.edgeSide}-${i}`}
            x={dotX}
            y={dotY}
            radius={SEAT_DOT_RADIUS}
            fill={
              isEditorMode
                ? '#D1D5DB'
                : isFilled
                  ? darkenHex(statusColour)
                  : '#D1D5DB'
            }
            stroke={isFilled ? statusColour : '#9CA3AF'}
            strokeWidth={1}
          />
        );
      })}

      {/* ---- Table name ---- */}
      <Text
        text={topLabel}
        fontSize={isOccupied ? 10 : 11}
        fontFamily="Inter, system-ui, sans-serif"
        fontStyle="bold"
        fill={isOccupied ? '#1e293b' : '#334155'}
        align="center"
        verticalAlign="middle"
        width={w}
        height={14}
        x={-w / 2}
        y={-8}
      />

      {/* ---- Capacity / party info ---- */}
      <Text
        text={bottomLabel}
        fontSize={9}
        fontFamily="Inter, system-ui, sans-serif"
        fill={isOccupied ? '#64748b' : '#94a3b8'}
        align="center"
        width={w}
        x={-w / 2}
        y={6}
      />

      {/* ---- Resize handles (editor + selected) ---- */}
      {isSelected && isEditorMode && !isCircular && !isOval &&
        (
          [
            [-w / 2, -h / 2],
            [w / 2, -h / 2],
            [w / 2, h / 2],
            [-w / 2, h / 2],
          ] as [number, number][]
        ).map(([cx, cy], i) => (
          <Rect
            key={`handle-${i}`}
            x={cx - HANDLE / 2}
            y={cy - HANDLE / 2}
            width={HANDLE}
            height={HANDLE}
            fill="#ffffff"
            stroke="#2563eb"
            strokeWidth={1.5}
          />
        ))}

      {isSelected && isEditorMode && isCircular &&
        [0, Math.PI / 2, Math.PI, 1.5 * Math.PI].map((a, i) => {
          const r = Math.min(w, h) / 2;
          return (
            <Rect
              key={`handle-${i}`}
              x={Math.cos(a) * r - HANDLE / 2}
              y={Math.sin(a) * r - HANDLE / 2}
              width={HANDLE}
              height={HANDLE}
              fill="#ffffff"
              stroke="#2563eb"
              strokeWidth={1.5}
            />
          );
        })}

      {children}
    </Group>
  );
}
