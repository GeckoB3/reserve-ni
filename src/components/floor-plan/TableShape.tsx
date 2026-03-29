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
  /**
   * Booking mini floor plan: both name and capacity are inset and vertically centred
   * inside the table so labels stay within the shape at small scales.
   */
  compactLabels?: boolean;
  /** Whole-table opacity (e.g. drag ghost on live floor). */
  groupOpacity?: number;
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

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function truncateForWidth(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  if (maxChars <= 1) return '…';
  return `${text.slice(0, maxChars - 1)}…`;
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
  compactLabels = false,
  groupOpacity = 1,
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

  const minDim = Math.min(w, h);
  const topEdge = isCircular ? -Math.min(w, h) / 2 : -h / 2;
  const bottomEdge = isCircular ? Math.min(w, h) / 2 : h / 2;

  /** Single-line box height for Konva Text (bold needs extra headroom vs raw fontSize). */
  const compactLineBox = (fs: number, bold: boolean) =>
    Math.ceil(fs * (bold ? 1.32 : 1.24)) + 2;
  const charW = (fs: number) => fs * 0.5;

  let fontName: number;
  let fontCap: number;
  let displayName: string;
  let displayCap: string;
  let nameY: number;
  let capY: number;
  let nameLineH: number;
  let innerW: number;
  let textX: number;
  let nameFill: string;
  let capFill: string;
  let compactTextStroke: string | undefined;
  let compactTextStrokeW: number;

  let capLineH = 0;

  if (compactLabels) {
    const insetY = clamp(minDim * 0.1, 4, 11);
    const insetXLocal = clamp(w * 0.04, 1, 8);
    const innerTop = topEdge + insetY;
    const innerBottom = bottomEdge - insetY;
    const innerBandH = Math.max(0, innerBottom - innerTop);
    /* Full table height for font shrink loop; padded band only for chord width on curves. */
    const innerH = Math.max(0, bottomEdge - topEdge);

    let iw = Math.max(14, w - insetXLocal * 2);
    /* Keep labels inside curved edges: limit width to horizontal chord at the
       vertical extremes of the centred label block (≈ ±innerBandH/2 from centre). */
    const ySpan = Math.min(innerBandH / 2, minDim * 0.42);
    if (isCircular) {
      const r = Math.min(w, h) / 2;
      const halfW = Math.sqrt(Math.max(0, r * r - ySpan * ySpan));
      iw = Math.min(iw, 2 * halfW * 0.88);
    } else if (isOval) {
      const rX = w / 2;
      const rY = h / 2;
      const yClamped = Math.min(ySpan, rY * 0.98);
      const halfW = rX * Math.sqrt(Math.max(0, 1 - (yClamped / rY) ** 2));
      iw = Math.min(iw, 2 * halfW * 0.88);
    }

    innerW = iw;
    textX = -innerW / 2;

    let fn = Math.round(clamp(minDim * 0.34, 10, 16));
    let fc = Math.round(clamp(minDim * 0.3, 9, 15));
    let gap = 2;

    const measureBlock = (nameFs: number, capFs: number, g: number) => {
      const nh = nameFs + 1;
      const ch = capFs + 1;
      return { blockH: nh + g + ch, nameBox: nh, capBox: ch };
    };

    let { blockH, nameBox, capBox } = measureBlock(fn, fc, gap);
    while (blockH > innerH && (fn > 4 || fc > 4 || gap > 0)) {
      if (gap > 0) {
        gap -= 1;
        ({ blockH, nameBox, capBox } = measureBlock(fn, fc, gap));
        continue;
      }
      if (fn >= fc && fn > 4) fn -= 1;
      else if (fc > 4) fc -= 1;
      else break;
      ({ blockH, nameBox, capBox } = measureBlock(fn, fc, gap));
    }

    fontName = fn;
    fontCap = fc;
    nameLineH = nameBox;
    capLineH = capBox;

    const nm = Math.max(3, Math.floor(innerW / (fontName * 0.38)));
    const cm = Math.max(2, Math.floor(innerW / (fontCap * 0.38)));
    displayName = truncateForWidth(topLabel, nm);
    displayCap = truncateForWidth(bottomLabel, cm);

    /* Centre the two-line block on the table origin (0,0) — same for rect, circle, oval. */
    nameY = -blockH / 2;
    capY = nameY + nameLineH + gap;

    nameFill = '#000000';
    capFill = '#000000';
    compactTextStroke = undefined;
    compactTextStrokeW = 0;
  } else {
    /* Edit + live floor: same centred block as compact picker, larger type & tighter leading. */
    const insetY = clamp(minDim * 0.05, 3, 8);
    const insetXLocal = clamp(w * 0.05, 3, 10);
    const innerTop = topEdge + insetY;
    const innerBottom = bottomEdge - insetY;
    const innerH = Math.max(0, innerBottom - innerTop);

    let iw = Math.max(14, w - insetXLocal * 2);
    const ySpan = Math.min(innerH / 2, minDim * 0.42);
    if (isCircular) {
      const r = Math.min(w, h) / 2;
      const halfW = Math.sqrt(Math.max(0, r * r - ySpan * ySpan));
      iw = Math.min(iw, 2 * halfW * 0.9);
    } else if (isOval) {
      const rX = w / 2;
      const rY = h / 2;
      const yClamped = Math.min(ySpan, rY * 0.98);
      const halfW = rX * Math.sqrt(Math.max(0, 1 - (yClamped / rY) ** 2));
      iw = Math.min(iw, 2 * halfW * 0.9);
    }

    innerW = iw;
    textX = -innerW / 2;

    let fn = Math.round(clamp(minDim * 0.32, 12, 20));
    let fc = Math.round(clamp(minDim * 0.26, 10, 17));
    let gap = 1;

    const measureBlock = (nameFs: number, capFs: number, g: number) => {
      const nh = compactLineBox(nameFs, true);
      const ch = compactLineBox(capFs, false);
      return { blockH: nh + g + ch, nameBox: nh, capBox: ch };
    };

    let { blockH, nameBox, capBox } = measureBlock(fn, fc, gap);
    while (blockH > innerH && (fn > 8 || fc > 8 || gap > 0)) {
      if (gap > 0) {
        gap -= 1;
        ({ blockH, nameBox, capBox } = measureBlock(fn, fc, gap));
        continue;
      }
      if (fn >= fc && fn > 8) fn -= 1;
      else if (fc > 8) fc -= 1;
      else break;
      ({ blockH, nameBox, capBox } = measureBlock(fn, fc, gap));
    }

    fontName = fn;
    fontCap = fc;
    nameLineH = nameBox;
    capLineH = capBox;

    const nm = Math.max(3, Math.floor(innerW / charW(fontName)));
    const cm = Math.max(2, Math.floor(innerW / charW(fontCap)));
    displayName = truncateForWidth(topLabel, nm);
    displayCap = truncateForWidth(bottomLabel, cm);

    const opticalUp = Math.min(2, Math.max(0, minDim * 0.01));
    const centred = innerTop + Math.max(0, (innerH - blockH) / 2);
    const rawStart = centred - opticalUp;
    const blockStart = clamp(rawStart, innerTop, Math.max(innerTop, innerBottom - blockH));
    nameY = blockStart;
    capY = blockStart + nameLineH + gap;

    nameFill = isOccupied ? '#1e293b' : '#334155';
    capFill = isOccupied ? '#64748b' : '#94a3b8';
    compactTextStroke = undefined;
    compactTextStrokeW = 0;
  }

  return (
    <Group
      x={x}
      y={y}
      opacity={groupOpacity}
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

      {/* ---- Seat dots (subdued in compact picker so centred labels stay legible) ---- */}
      <Group opacity={compactLabels ? 0.35 : 1}>
        {seats.map((seat, i) => {
          const dotX = seat.x + SEAT_DOT_OFFSET * Math.cos(seat.angle);
          const dotY = seat.y + SEAT_DOT_OFFSET * Math.sin(seat.angle);
          const isFilled = isOccupied && i < booking!.party_size;

          return (
            <Circle
              key={`seat-${seat.edgeSide}-${i}`}
              x={dotX}
              y={dotY}
              radius={compactLabels ? 4 : SEAT_DOT_RADIUS}
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
      </Group>

      {/* ---- Labels (clipped to table bounds so font-metric overflow is invisible) ---- */}
      <Group
        clip={{ x: -w / 2, y: topEdge, width: w, height: bottomEdge - topEdge }}
      >
        <Text
          text={displayName}
          fontSize={fontName}
          fontFamily="Inter, system-ui, sans-serif"
          fontStyle="bold"
          fill={nameFill}
          stroke={compactTextStroke}
          strokeWidth={compactTextStrokeW}
          align="center"
          verticalAlign="middle"
          wrap="none"
          ellipsis={true}
          width={innerW}
          height={nameLineH}
          x={textX}
          y={nameY}
          listening={false}
        />
        <Text
          text={displayCap}
          fontSize={fontCap}
          fontFamily="Inter, system-ui, sans-serif"
          fontStyle="normal"
          fill={capFill}
          stroke={compactTextStroke}
          strokeWidth={compactTextStrokeW}
          align="center"
          verticalAlign="middle"
          wrap="none"
          ellipsis={true}
          width={innerW}
          height={capLineH}
          x={textX}
          y={capY}
          listening={false}
        />
      </Group>

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
