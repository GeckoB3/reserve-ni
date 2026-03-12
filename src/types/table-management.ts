import type { TableServiceStatus } from '@/lib/table-management/constants';

/**
 * Table management types — optional layer on top of covers-based availability.
 */

export type TableShape = 'rectangle' | 'circle' | 'square' | 'oval' | 'l-shape';

export interface VenueTable {
  id: string;
  venue_id: string;
  name: string;
  min_covers: number;
  max_covers: number;
  shape: TableShape;
  zone: string | null;
  position_x: number | null;
  position_y: number | null;
  width: number | null;
  height: number | null;
  rotation: number | null;
  sort_order: number;
  server_section: string | null;
  is_active: boolean;
  snap_group_id: string | null;
  snap_sides: string[] | null;
  created_at: string;
  updated_at: string;
}

export interface TableCombination {
  id: string;
  venue_id: string;
  name: string;
  combined_min_covers: number;
  combined_max_covers: number;
  is_active: boolean;
  created_at: string;
  members?: TableCombinationMember[];
}

export interface TableCombinationMember {
  id: string;
  combination_id: string;
  table_id: string;
  table?: VenueTable;
}

export interface BookingTableAssignment {
  id: string;
  booking_id: string;
  table_id: string;
  assigned_at: string;
  assigned_by: string | null;
  table?: VenueTable;
}

export interface TableStatus {
  id: string;
  table_id: string;
  booking_id: string | null;
  status: TableServiceStatus;
  updated_at: string;
  updated_by: string | null;
  table?: VenueTable;
}

export interface TableBlock {
  id: string;
  venue_id: string;
  table_id: string;
  start_at: string;
  end_at: string;
  reason: string | null;
  created_at: string;
  created_by: string | null;
}

export interface TableAvailabilityCandidate {
  type: 'single' | 'combination';
  source?: 'single' | 'auto' | 'manual';
  table_ids: string[];
  table_names: string[];
  min_covers: number;
  max_covers: number;
  combination_id?: string;
  combination_name?: string;
  spare_covers?: number;
  score?: number;
}

export interface TableGridCell {
  table_id: string;
  time: string;
  is_available: boolean;
  is_blocked?: boolean;
  booking_id: string | null;
  block_id?: string | null;
  block_details?: {
    id: string;
    reason: string | null;
    start_time: string;
    end_time: string;
  } | null;
  booking_details: {
    guest_name: string;
    party_size: number;
    status: string;
    deposit_status?: string | null;
    start_time: string;
    end_time: string;
    dietary_notes: string | null;
    occasion: string | null;
  } | null;
}

export interface TableGridData {
  tables: VenueTable[];
  cells: TableGridCell[];
  slot_interval_minutes?: number;
  unassigned_bookings: {
    id: string;
    guest_name: string;
    party_size: number;
    start_time: string;
    end_time: string;
    status: string;
    dietary_notes: string | null;
    occasion: string | null;
  }[];
  summary: {
    total_covers_booked: number;
    total_covers_capacity: number;
    tables_in_use: number;
    tables_total: number;
    unassigned_count: number;
    combos_in_use?: number;
  };
}

export interface UndoAction {
  id: string;
  type: 'reassign_table' | 'change_time' | 'resize' | 'unassign';
  description: string;
  timestamp: number;
  previous_state: Record<string, unknown>;
  current_state: Record<string, unknown>;
}

/**
 * Returns floor-plan dimensions (width/height as % of canvas) scaled to table capacity.
 * Circles use equal width/height; squares use the short-side dimension for both axes;
 * rectangles grow wider for larger parties.
 */
export function getTableDimensions(maxCovers: number, shape: string): { width: number; height: number } {
  if (shape === 'circle') {
    if (maxCovers <= 2) return { width: 6, height: 6 };
    if (maxCovers <= 4) return { width: 7.5, height: 7.5 };
    if (maxCovers <= 6) return { width: 9, height: 9 };
    return { width: 10.5, height: 10.5 };
  }
  if (shape === 'square') {
    if (maxCovers <= 2) return { width: 6.5, height: 6.5 };
    if (maxCovers <= 4) return { width: 6.5, height: 6.5 };
    if (maxCovers <= 6) return { width: 7, height: 7 };
    if (maxCovers <= 8) return { width: 7.5, height: 7.5 };
    return { width: 8.5, height: 8.5 };
  }
  if (maxCovers <= 2) return { width: 6.5, height: 6.5 };
  if (maxCovers <= 4) return { width: 8, height: 6.5 };
  if (maxCovers <= 6) return { width: 10, height: 7 };
  if (maxCovers <= 8) return { width: 12, height: 7.5 };
  return { width: 14, height: 8.5 };
}

export type BlockedSides = { top: boolean; right: boolean; bottom: boolean; left: boolean };

/**
 * Detects which sides of each table are touching another table (edge-to-edge).
 * Returns a map from table ID to the set of blocked sides.
 */
export function computeTableAdjacency(
  tables: Array<{ id: string; x: number; y: number; w: number; h: number }>,
  tolerance: number = 8,
): Map<string, BlockedSides> {
  const result = new Map<string, BlockedSides>();
  for (const t of tables) {
    result.set(t.id, { top: false, right: false, bottom: false, left: false });
  }

  for (let i = 0; i < tables.length; i++) {
    const a = tables[i]!;
    const aL = a.x - a.w / 2;
    const aR = a.x + a.w / 2;
    const aT = a.y - a.h / 2;
    const aB = a.y + a.h / 2;

    for (let j = i + 1; j < tables.length; j++) {
      const b = tables[j]!;
      const bL = b.x - b.w / 2;
      const bR = b.x + b.w / 2;
      const bT = b.y - b.h / 2;
      const bB = b.y + b.h / 2;

      const overlapY = aT < bB - tolerance && aB > bT + tolerance;
      const overlapX = aL < bR - tolerance && aR > bL + tolerance;

      if (overlapY && Math.abs(aR - bL) <= tolerance) {
        result.get(a.id)!.right = true;
        result.get(b.id)!.left = true;
      }
      if (overlapY && Math.abs(aL - bR) <= tolerance) {
        result.get(a.id)!.left = true;
        result.get(b.id)!.right = true;
      }
      if (overlapX && Math.abs(aB - bT) <= tolerance) {
        result.get(a.id)!.bottom = true;
        result.get(b.id)!.top = true;
      }
      if (overlapX && Math.abs(aT - bB) <= tolerance) {
        result.get(a.id)!.top = true;
        result.get(b.id)!.bottom = true;
      }
    }
  }

  return result;
}

/**
 * Distributes tables in a grid layout, returning position_x/position_y (%) for each.
 * Takes table dimensions into account for spacing.
 */
export function computeGridPositions(
  tables: Array<{ max_covers: number; shape: string; width?: number | null; height?: number | null }>
): Array<{ position_x: number; position_y: number; width: number; height: number }> {
  if (tables.length === 0) return [];

  const dims = tables.map((t) => {
    if (t.width && t.height) return { width: t.width, height: t.height };
    return getTableDimensions(t.max_covers, t.shape);
  });

  const cols = Math.ceil(Math.sqrt(tables.length));
  const rows = Math.ceil(tables.length / cols);

  const paddingX = 4;
  const paddingY = 6;
  const marginX = 5;
  const marginY = 8;

  const cellW = (100 - 2 * marginX) / cols;
  const cellH = (100 - 2 * marginY) / rows;

  return dims.map((d, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    return {
      position_x: marginX + col * cellW + cellW / 2,
      position_y: marginY + row * cellH + cellH / 2,
      width: Math.min(d.width, cellW - paddingX),
      height: Math.min(d.height, cellH - paddingY),
    };
  });
}

/**
 * Generates chair positions (in local coordinates) around a table.
 * When `blocked` is provided, chairs on those edges are omitted — used when
 * tables are snapped edge-to-edge to form a combination.
 */
export function generateChairPositions(
  shape: string,
  w: number,
  h: number,
  maxCovers: number,
  blocked?: BlockedSides,
): Array<{ x: number; y: number }> {
  const chairs: Array<{ x: number; y: number }> = [];
  const offset = 8;

  if (shape === 'circle') {
    const r = Math.min(w, h) / 2 + offset;
    for (let i = 0; i < maxCovers; i++) {
      const angle = (i / maxCovers) * Math.PI * 2 - Math.PI / 2;
      chairs.push({ x: Math.cos(angle) * r, y: Math.sin(angle) * r });
    }
    return filterBlockedChairs(chairs, w, h, blocked);
  }

  if (shape === 'oval') {
    const rx = w / 2 + offset;
    const ry = h / 2 + offset;
    for (let i = 0; i < maxCovers; i++) {
      const angle = (i / maxCovers) * Math.PI * 2 - Math.PI / 2;
      chairs.push({ x: Math.cos(angle) * rx, y: Math.sin(angle) * ry });
    }
    return filterBlockedChairs(chairs, w, h, blocked);
  }

  const hw = w / 2;
  const hh = h / 2;
  const sides = {
    top: [] as Array<{ x: number; y: number }>,
    bottom: [] as Array<{ x: number; y: number }>,
    left: [] as Array<{ x: number; y: number }>,
    right: [] as Array<{ x: number; y: number }>,
  };

  if (maxCovers <= 2) {
    sides.left.push({ x: -hw - offset, y: 0 });
    sides.right.push({ x: hw + offset, y: 0 });
  } else if (maxCovers <= 4) {
    sides.top.push({ x: 0, y: -hh - offset });
    sides.bottom.push({ x: 0, y: hh + offset });
    sides.left.push({ x: -hw - offset, y: 0 });
    sides.right.push({ x: hw + offset, y: 0 });
  } else {
    const perLongSide = Math.ceil(maxCovers / 2) - (maxCovers > 4 ? 1 : 0);
    const perShortSide = Math.floor((maxCovers - perLongSide * 2) / 2);
    const remaining = maxCovers - perLongSide * 2 - perShortSide * 2;

    for (let i = 0; i < perLongSide; i++) {
      const x = -hw + (w / (perLongSide + 1)) * (i + 1);
      sides.top.push({ x, y: -hh - offset });
      sides.bottom.push({ x, y: hh + offset });
    }
    for (let i = 0; i < perShortSide; i++) {
      const y = -hh + (h / (perShortSide + 1)) * (i + 1);
      sides.left.push({ x: -hw - offset, y });
      sides.right.push({ x: hw + offset, y });
    }
    if (remaining > 0) {
      sides.top.push({ x: hw * 0.6, y: -hh - offset });
    }
  }

  if (!blocked) {
    chairs.push(...sides.top, ...sides.right, ...sides.bottom, ...sides.left);
  } else {
    if (!blocked.top) chairs.push(...sides.top);
    if (!blocked.right) chairs.push(...sides.right);
    if (!blocked.bottom) chairs.push(...sides.bottom);
    if (!blocked.left) chairs.push(...sides.left);
  }

  return chairs.slice(0, maxCovers);
}

function filterBlockedChairs(
  chairs: Array<{ x: number; y: number }>,
  w: number,
  h: number,
  blocked?: BlockedSides,
): Array<{ x: number; y: number }> {
  if (!blocked || (!blocked.top && !blocked.right && !blocked.bottom && !blocked.left)) {
    return chairs;
  }
  return chairs.filter((c) => {
    const angle = Math.atan2(c.y, c.x);
    if (blocked.right && angle > -Math.PI / 4 && angle < Math.PI / 4) return false;
    if (blocked.bottom && angle >= Math.PI / 4 && angle <= (3 * Math.PI) / 4) return false;
    if (blocked.left && (angle > (3 * Math.PI) / 4 || angle < -(3 * Math.PI) / 4)) return false;
    if (blocked.top && angle >= -(3 * Math.PI) / 4 && angle <= -Math.PI / 4) return false;
    return true;
  });
}
