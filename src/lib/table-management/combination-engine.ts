import type { BookingModel } from '@/types/booking-models';
import { ALL_DAYS_OF_WEEK, isCombinationAllowedForBookingContext } from '@/lib/table-management/combination-rules';

export interface CombinationTable {
  id: string;
  name: string;
  max_covers: number;
  is_active?: boolean;
  position_x: number | null;
  position_y: number | null;
  width: number | null;
  height: number | null;
  rotation: number | null;
}

export interface CombinationBooking {
  id: string;
  status: string;
  booking_time: string;
  estimated_end_time: string | null;
  table_ids: string[];
}

export interface CombinationBlock {
  table_id: string;
  start_at: string;
  end_at: string;
}

export interface ManualCombination {
  id: string;
  name: string;
  table_ids: string[];
  combined_min_covers: number;
  combined_max_covers: number;
  is_active?: boolean;
  days_of_week?: number[];
  time_start?: string | null;
  time_end?: string | null;
  booking_type_filters?: string[] | null;
  requires_manager_approval?: boolean;
  internal_notes?: string | null;
}

/** DB row for combination_auto_overrides (keyed by sorted table ids). */
export interface AutoCombinationOverrideInput {
  id: string;
  table_group_key: string;
  disabled: boolean;
  /** When true, combination is still offered if it drops out of adjacency detection. */
  locked: boolean;
  display_name: string | null;
  combined_min_covers: number | null;
  combined_max_covers: number | null;
  days_of_week: number[];
  time_start: string | null;
  time_end: string | null;
  booking_type_filters: string[] | null;
  requires_manager_approval: boolean;
  internal_notes: string | null;
}

export interface BoundingBox {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface CombinationSuggestion {
  source: 'single' | 'auto' | 'manual';
  table_ids: string[];
  table_names: string[];
  combined_capacity: number;
  spare_covers: number;
  score: number;
  waste: number;
  table_count: number;
  compactness_area: number;
  manual_combination_id?: string;
  manual_combination_name?: string;
  auto_override_id?: string;
  requires_manager_approval?: boolean;
  internal_notes?: string | null;
}

const ACTIVE_BOOKING_STATUSES = new Set(['Pending', 'Booked', 'Confirmed', 'Seated']);

function timeToMinutes(value: string): number {
  const [hours, minutes] = value.slice(0, 5).split(':').map(Number);
  return (hours ?? 0) * 60 + (minutes ?? 0);
}

function extractIsoTime(value: string): string {
  if (value.includes('T')) {
    const part = value.split('T')[1] ?? '';
    return part.slice(0, 5);
  }
  return value.slice(0, 5);
}

/** Matches the window used inside findValidCombinations for a given slot datetime. */
export function getRequestWindowMinutes(
  datetime: string,
  durationMinutes: number,
): { requestStartMin: number; requestEndMin: number } {
  const requestStartMin = timeToMinutes(extractIsoTime(datetime));
  return { requestStartMin, requestEndMin: requestStartMin + durationMinutes };
}

export function getRotatedBoundingBox(table: CombinationTable): BoundingBox {
  const width = table.width ?? 0;
  const height = table.height ?? 0;
  const x = table.position_x ?? 0;
  const y = table.position_y ?? 0;
  const rotation = table.rotation ?? 0;

  if (rotation === 0) {
    return {
      left: x,
      right: x + width,
      top: y,
      bottom: y + height,
    };
  }

  const cx = x + width / 2;
  const cy = y + height / 2;
  const angle = (rotation * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);

  const corners = [
    { x, y },
    { x: x + width, y },
    { x: x + width, y: y + height },
    { x, y: y + height },
  ].map((corner) => ({
    x: cx + (corner.x - cx) * cos - (corner.y - cy) * sin,
    y: cy + (corner.x - cx) * sin + (corner.y - cy) * cos,
  }));

  return {
    left: Math.min(...corners.map((c) => c.x)),
    right: Math.max(...corners.map((c) => c.x)),
    top: Math.min(...corners.map((c) => c.y)),
    bottom: Math.max(...corners.map((c) => c.y)),
  };
}

export function getBoundingBoxGap(a: BoundingBox, b: BoundingBox): number {
  const horizontalGap = Math.max(0, Math.max(a.left, b.left) - Math.min(a.right, b.right));
  const verticalGap = Math.max(0, Math.max(a.top, b.top) - Math.min(a.bottom, b.bottom));
  return Math.sqrt(horizontalGap ** 2 + verticalGap ** 2);
}

/** Separations along x and y between two axis-aligned boxes (after rotation → AABB). */
export function getAxialGaps(a: BoundingBox, b: BoundingBox): { horizontalGap: number; verticalGap: number } {
  const horizontalGap = Math.max(0, Math.max(a.left, b.left) - Math.min(a.right, b.right));
  const verticalGap = Math.max(0, Math.max(a.top, b.top) - Math.min(a.bottom, b.bottom));
  return { horizontalGap, verticalGap };
}

const OVERLAP_EPS = 1e-3;

/** Pixel tolerance for “centers lie on one line” (floor-plan units). */
const COLLINEAR_CENTER_EPS = 1.5;

/** Minimum separation between the two points that define the combination line (px). */
const LINE_MIN_SPAN_EPS = 1e-2;

/**
 * Centre of a table AABB (same coordinate space as {@link getRotatedBoundingBox}).
 */
export function centerOfBoundingBox(box: BoundingBox): { x: number; y: number } {
  return {
    x: (box.left + box.right) / 2,
    y: (box.top + box.bottom) / 2,
  };
}

/**
 * Cross product (p1 - p0) × (p2 - p0) — zero when points are collinear.
 */
function cross2(p0: { x: number; y: number }, p1: { x: number; y: number }, p2: { x: number; y: number }): number {
  return (p1.x - p0.x) * (p2.y - p0.y) - (p1.y - p0.y) * (p2.x - p0.x);
}

export function areTableCentersCollinear(centers: Array<{ x: number; y: number }>): boolean {
  if (centers.length <= 2) return true;
  const p0 = centers[0]!;
  const p1 = centers[1]!;
  const dx = p1.x - p0.x;
  const dy = p1.y - p0.y;
  const baseLen = Math.hypot(dx, dy);
  if (baseLen < COLLINEAR_CENTER_EPS) {
    return centers.every((p) => Math.hypot(p.x - p0.x, p.y - p0.y) < COLLINEAR_CENTER_EPS * 4);
  }
  for (let i = 2; i < centers.length; i++) {
    const c = cross2(p0, p1, centers[i]!);
    if (Math.abs(c) > COLLINEAR_CENTER_EPS * baseLen) return false;
  }
  return true;
}

/**
 * Whether the infinite line through `p0` and `p1` intersects or touches the axis-aligned box.
 */
export function infiniteLineIntersectsAabb(
  p0: { x: number; y: number },
  p1: { x: number; y: number },
  box: BoundingBox,
): boolean {
  const corners = [
    { x: box.left, y: box.top },
    { x: box.right, y: box.top },
    { x: box.right, y: box.bottom },
    { x: box.left, y: box.bottom },
  ];
  const s0 = cross2(p0, p1, corners[0]!);
  if (s0 === 0) return true;
  for (let i = 1; i < 4; i++) {
    const si = cross2(p0, p1, corners[i]!);
    if (si === 0) return true;
    if (Math.sign(si) !== Math.sign(s0)) return true;
  }
  return false;
}

/**
 * Horizontal segment (y fixed) from xMin to xMax intersects `box` (non-degenerate overlap on x).
 */
export function horizontalSegmentIntersectsAabb(y: number, xMin: number, xMax: number, box: BoundingBox): boolean {
  if (y < box.top - OVERLAP_EPS || y > box.bottom + OVERLAP_EPS) return false;
  const xa = Math.min(xMin, xMax);
  const xb = Math.max(xMin, xMax);
  const overlap = Math.min(xb, box.right) - Math.max(xa, box.left);
  return overlap > OVERLAP_EPS;
}

/**
 * Vertical segment (x fixed) from yMin to yMax intersects `box` (non-degenerate overlap on y).
 */
export function verticalSegmentIntersectsAabb(x: number, yMin: number, yMax: number, box: BoundingBox): boolean {
  if (x < box.left - OVERLAP_EPS || x > box.right + OVERLAP_EPS) return false;
  const ya = Math.min(yMin, yMax);
  const yb = Math.max(yMin, yMax);
  const overlap = Math.min(yb, box.bottom) - Math.max(ya, box.top);
  return overlap > OVERLAP_EPS;
}

function centersFormHorizontalRow(centers: Array<{ x: number; y: number }>): boolean {
  if (centers.length < 2) return false;
  const y0 = centers[0]!.y;
  if (!centers.every((p) => Math.abs(p.y - y0) <= COLLINEAR_CENTER_EPS)) return false;
  const xs = centers.map((p) => p.x);
  return Math.max(...xs) - Math.min(...xs) > LINE_MIN_SPAN_EPS;
}

function centersFormVerticalColumn(centers: Array<{ x: number; y: number }>): boolean {
  if (centers.length < 2) return false;
  const x0 = centers[0]!.x;
  if (!centers.every((p) => Math.abs(p.x - x0) <= COLLINEAR_CENTER_EPS)) return false;
  const ys = centers.map((p) => p.y);
  return Math.max(...ys) - Math.min(...ys) > LINE_MIN_SPAN_EPS;
}

/**
 * Automatic groups of 2+ tables: member centres must align in a **horizontal row** (shared y) or
 * **vertical column** (shared x) — not a diagonal line. The “sight line” through the middle of
 * the combined tables is the **segment** between the outermost member centres on that row/column.
 * Any other active table whose box meets that segment (same row/column strip) invalidates the group.
 *
 * Using a finite segment (not an infinite line) allows e.g. tables 1+2 in the same row while
 * tables 3 and 4 remain on that row but outside the segment between 1 and 2.
 */
export function isValidCollinearCombinationGroup(
  memberIds: string[],
  boxesById: Map<string, BoundingBox>,
  allActiveTables: CombinationTable[],
): boolean {
  if (memberIds.length <= 1) return true;

  const centers: Array<{ x: number; y: number }> = [];
  for (const id of memberIds) {
    const box = boxesById.get(id);
    if (!box) return false;
    centers.push(centerOfBoundingBox(box));
  }

  const horizontal = centersFormHorizontalRow(centers);
  const vertical = centersFormVerticalColumn(centers);
  if (!horizontal && !vertical) return false;

  const memberSet = new Set(memberIds);

  if (horizontal) {
    const yLine = centers.reduce((s, p) => s + p.y, 0) / centers.length;
    const xs = centers.map((p) => p.x);
    const xMin = Math.min(...xs);
    const xMax = Math.max(...xs);
    for (const t of allActiveTables) {
      if (t.is_active === false) continue;
      if (memberSet.has(t.id)) continue;
      const box = boxesById.get(t.id);
      if (!box) continue;
      if (horizontalSegmentIntersectsAabb(yLine, xMin, xMax, box)) return false;
    }
    return true;
  }

  const xLine = centers.reduce((s, p) => s + p.x, 0) / centers.length;
  const ys = centers.map((p) => p.y);
  const yMin = Math.min(...ys);
  const yMax = Math.max(...ys);
  for (const t of allActiveTables) {
    if (t.is_active === false) continue;
    if (memberSet.has(t.id)) continue;
    const box = boxesById.get(t.id);
    if (!box) continue;
    if (verticalSegmentIntersectsAabb(xLine, yMin, yMax, box)) return false;
  }

  return true;
}

/**
 * Whether two boxes may be adjacent for automatic combinations: same row or same column
 * (no pure diagonal separation), with a positive edge overlap or gap along one axis only.
 * Corner-only point contact is rejected.
 */
export function isValidAxisAlignedCombinationPair(a: BoundingBox, b: BoundingBox): boolean {
  const { horizontalGap, verticalGap } = getAxialGaps(a, b);

  if (horizontalGap > 0 && verticalGap > 0) {
    return false;
  }

  const ix1 = Math.max(a.left, b.left);
  const ix2 = Math.min(a.right, b.right);
  const iy1 = Math.max(a.top, b.top);
  const iy2 = Math.min(a.bottom, b.bottom);
  const overlapW = Math.max(0, ix2 - ix1);
  const overlapH = Math.max(0, iy2 - iy1);

  if (overlapW <= OVERLAP_EPS && overlapH <= OVERLAP_EPS) {
    return false;
  }

  return true;
}

/**
 * Whether two boxes may share an adjacency edge for automatic combinations, after the
 * Euclidean gap between boxes has already been checked against the venue threshold.
 * Allows diagonal “as the crow flies” proximity, but rejects corner-only point contact
 * (no shared edge segment and no positive separation along both axes).
 */
export function isValidCombinationAdjacencyPair(a: BoundingBox, b: BoundingBox): boolean {
  const { horizontalGap, verticalGap } = getAxialGaps(a, b);

  const ix1 = Math.max(a.left, b.left);
  const ix2 = Math.min(a.right, b.right);
  const iy1 = Math.max(a.top, b.top);
  const iy2 = Math.min(a.bottom, b.bottom);
  const overlapW = Math.max(0, ix2 - ix1);
  const overlapH = Math.max(0, iy2 - iy1);

  if (overlapW <= OVERLAP_EPS && overlapH <= OVERLAP_EPS) {
    if (horizontalGap > 0 && verticalGap > 0) {
      return true;
    }
    return false;
  }

  return true;
}

export function detectAdjacentTables(
  tables: CombinationTable[],
  threshold = 80
): Map<string, Set<string>> {
  const adjacency = new Map<string, Set<string>>();
  const boxes = new Map<string, BoundingBox>();
  const activeTables = tables.filter((table) => table.is_active !== false);

  for (const table of activeTables) {
    boxes.set(table.id, getRotatedBoundingBox(table));
    adjacency.set(table.id, new Set<string>());
  }

  for (let i = 0; i < activeTables.length; i++) {
    for (let j = i + 1; j < activeTables.length; j++) {
      const a = activeTables[i]!;
      const b = activeTables[j]!;
      const boxA = boxes.get(a.id)!;
      const boxB = boxes.get(b.id)!;
      const gap = getBoundingBoxGap(boxA, boxB);
      if (gap > threshold) continue;
      if (!isValidAxisAlignedCombinationPair(boxA, boxB)) continue;
      adjacency.get(a.id)!.add(b.id);
      adjacency.get(b.id)!.add(a.id);
    }
  }

  return adjacency;
}

function isConnectedSubset(subset: string[], adjacencyMap: Map<string, Set<string>>): boolean {
  if (subset.length <= 1) return subset.length === 1;
  const set = new Set(subset);
  const start = subset[0]!;
  const visited = new Set<string>([start]);
  const queue = [start];
  while (queue.length > 0) {
    const u = queue.shift()!;
    for (const v of adjacencyMap.get(u) ?? []) {
      if (!set.has(v) || visited.has(v)) continue;
      visited.add(v);
      queue.push(v);
    }
  }
  return visited.size === subset.length;
}

/**
 * All unordered groups of 2..maxGroupSize tables that form a connected subgraph
 * under the given adjacency map (same graph as {@link detectAdjacentTables}),
 * with horizontal- or vertical-aligned centres and no other table’s box intersecting the
 * centre segment between outermost members (see {@link isValidCollinearCombinationGroup}).
 */
export function enumerateAdjacentCombinationGroups(
  adjacencyMap: Map<string, Set<string>>,
  maxGroupSize: number,
  tables: CombinationTable[],
): string[][] {
  const activeTables = tables.filter((t) => t.is_active !== false);
  const boxesById = new Map(activeTables.map((t) => [t.id, getRotatedBoundingBox(t)]));
  const ids = [...adjacencyMap.keys()].sort();
  const results: string[][] = [];
  const seen = new Set<string>();

  for (let k = 2; k <= maxGroupSize; k++) {
    const combo: string[] = [];
    function dfs(start: number) {
      if (combo.length === k) {
        if (isConnectedSubset(combo, adjacencyMap)) {
          const sorted = [...combo].sort();
          if (!isValidCollinearCombinationGroup(sorted, boxesById, activeTables)) return;
          const key = sorted.join('|');
          if (!seen.has(key)) {
            seen.add(key);
            results.push(sorted);
          }
        }
        return;
      }
      for (let i = start; i < ids.length; i++) {
        combo.push(ids[i]!);
        dfs(i + 1);
        combo.pop();
      }
    }
    dfs(0);
  }

  return results.sort((a, b) => a.join('|').localeCompare(b.join('|')));
}

export function findConnectedGroups(
  seedTableId: string,
  availableTables: CombinationTable[],
  adjacencyMap: Map<string, Set<string>>,
  targetCapacity: number,
  maxGroupSize = 4,
  options?: { allActiveTables?: CombinationTable[] },
): string[][] {
  const tableMap = new Map(availableTables.map((table) => [table.id, table]));
  const availableSet = new Set(availableTables.map((table) => table.id));
  if (!tableMap.has(seedTableId)) return [];

  const obstructionTables = options?.allActiveTables ?? availableTables;
  const boxesById = new Map(obstructionTables.map((t) => [t.id, getRotatedBoundingBox(t)]));

  const results: string[][] = [];
  const queue: string[][] = [[seedTableId]];
  const seen = new Set<string>([seedTableId]);

  while (queue.length > 0) {
    const group = queue.shift()!;
    const groupSet = new Set(group);
    const capacity = group.reduce((sum, tableId) => sum + (tableMap.get(tableId)?.max_covers ?? 0), 0);
    if (capacity >= targetCapacity) {
      if (group.length < 2 || isValidCollinearCombinationGroup(group, boxesById, obstructionTables)) {
        results.push(group);
      }
      continue;
    }
    if (group.length >= maxGroupSize) continue;

    const candidates = new Set<string>();
    for (const tableId of group) {
      for (const adjacentId of adjacencyMap.get(tableId) ?? []) {
        if (!groupSet.has(adjacentId) && availableSet.has(adjacentId)) {
          candidates.add(adjacentId);
        }
      }
    }

    for (const candidateId of candidates) {
      const nextGroup = [...group, candidateId];
      const key = [...nextGroup].sort().join('|');
      if (seen.has(key)) continue;
      seen.add(key);
      queue.push(nextGroup);
    }
  }

  return results;
}

export function scoreCombination(
  groupTableIds: string[],
  partySize: number,
  tableMap: Map<string, CombinationTable>,
  isManual = false
): { score: number; waste: number; compactnessArea: number } {
  const tables = groupTableIds
    .map((tableId) => tableMap.get(tableId))
    .filter((table): table is CombinationTable => Boolean(table));

  const totalCapacity = tables.reduce((sum, table) => sum + table.max_covers, 0);
  const waste = Math.max(0, totalCapacity - partySize);
  const tableCount = tables.length;
  const boxes = tables.map((table) => getRotatedBoundingBox(table));

  const compactnessArea =
    boxes.length === 0
      ? 0
      : (Math.max(...boxes.map((box) => box.right)) - Math.min(...boxes.map((box) => box.left))) *
        (Math.max(...boxes.map((box) => box.bottom)) - Math.min(...boxes.map((box) => box.top)));

  const wasteScore = (waste / Math.max(1, partySize)) * 40;
  const countScore = Math.max(0, tableCount - 1) * 30;
  const compactScore = (compactnessArea / 100000) * 20;
  const manualBonus = isManual ? -10 : 0;

  return {
    score: wasteScore + countScore + compactScore + manualBonus,
    waste,
    compactnessArea,
  };
}

/**
 * Tables that are not free for the given time window (booking overlap or table block).
 * Used by the suggest API for floor-plan busy hints and by tests.
 */
export function getOccupiedTableIdsForWindow(
  tableIds: string[],
  requestStartMin: number,
  requestEndMin: number,
  bookings: CombinationBooking[],
  blocks: CombinationBlock[],
  excludeBookingId?: string,
): string[] {
  return tableIds.filter(
    (id) =>
      !isTableAvailableForWindow(id, requestStartMin, requestEndMin, bookings, blocks, excludeBookingId),
  );
}

function isTableAvailableForWindow(
  tableId: string,
  requestStartMin: number,
  requestEndMin: number,
  bookings: CombinationBooking[],
  blocks: CombinationBlock[],
  excludeBookingId?: string
): boolean {
  const hasBookingOverlap = bookings.some((booking) => {
    if (!ACTIVE_BOOKING_STATUSES.has(booking.status)) return false;
    if (excludeBookingId && booking.id === excludeBookingId) return false;
    if (!booking.table_ids.includes(tableId)) return false;
    const bookingStart = timeToMinutes(extractIsoTime(booking.booking_time));
    const bookingEnd = booking.estimated_end_time
      ? timeToMinutes(extractIsoTime(booking.estimated_end_time))
      : bookingStart + 90;
    return requestStartMin < bookingEnd && bookingStart < requestEndMin;
  });

  if (hasBookingOverlap) return false;

  const hasBlockOverlap = blocks.some((block) => {
    if (block.table_id !== tableId) return false;
    const blockStart = timeToMinutes(extractIsoTime(block.start_at));
    const blockEnd = timeToMinutes(extractIsoTime(block.end_at));
    return requestStartMin < blockEnd && blockStart < requestEndMin;
  });

  return !hasBlockOverlap;
}

export function findValidCombinations(args: {
  partySize: number;
  datetime: string;
  durationMinutes: number;
  tables: CombinationTable[];
  bookings: CombinationBooking[];
  blocks: CombinationBlock[];
  adjacencyMap: Map<string, Set<string>>;
  manualCombinations: ManualCombination[];
  /** Key = sorted table ids joined with `|`. */
  autoOverrides?: Map<string, AutoCombinationOverrideInput>;
  /** When set, day/time/booking-type filters apply to auto overrides and manual custom rows. */
  bookingContext?: {
    bookingDate: string;
    bookingTime: string;
    bookingModel: BookingModel;
  };
  excludeBookingId?: string;
  maxGroupSize?: number;
}): CombinationSuggestion[] {
  const {
    partySize,
    datetime,
    durationMinutes,
    tables,
    bookings,
    blocks,
    adjacencyMap,
    manualCombinations,
    autoOverrides,
    bookingContext,
    excludeBookingId,
    maxGroupSize = 4,
  } = args;

  const tableMap = new Map(
    tables
      .filter((table) => table.is_active !== false)
      .map((table) => [table.id, table])
  );
  const requestStartMin = timeToMinutes(extractIsoTime(datetime));
  const requestEndMin = requestStartMin + durationMinutes;

  const availableTables = Array.from(tableMap.values()).filter((table) =>
    isTableAvailableForWindow(
      table.id,
      requestStartMin,
      requestEndMin,
      bookings,
      blocks,
      excludeBookingId
    )
  );

  const availableSet = new Set(availableTables.map((table) => table.id));
  const singleSuggestions: CombinationSuggestion[] = [];
  const comboByKey = new Map<string, CombinationSuggestion>();

  const pushAutoFromOverride = (sortedGroup: string[], ov: AutoCombinationOverrideInput | undefined) => {
    if (sortedGroup.length < 2) return;
    if (ov?.disabled) return;
    const key = sortedGroup.join('|');
    if (comboByKey.has(key)) return;
    if (sortedGroup.some((id) => !availableSet.has(id))) return;

    const tablesInGroup = sortedGroup.map((tableId) => tableMap.get(tableId)).filter(Boolean) as CombinationTable[];
    if (tablesInGroup.length !== sortedGroup.length) return;
    const sumCap = tablesInGroup.reduce((sum, table) => sum + table.max_covers, 0);
    const effectiveMaxParty = ov?.combined_max_covers ?? sumCap;
    const effectiveMinParty = ov?.combined_min_covers ?? 1;
    if (partySize < effectiveMinParty || partySize > effectiveMaxParty) return;
    const effectiveCapacity = Math.min(sumCap, effectiveMaxParty);
    if (effectiveCapacity < partySize) return;

    if (ov && bookingContext) {
      const ok = isCombinationAllowedForBookingContext(
        {
          days_of_week: ov.days_of_week,
          time_start: ov.time_start,
          time_end: ov.time_end,
          booking_type_filters: ov.booking_type_filters,
          requires_manager_approval: ov.requires_manager_approval,
        },
        {
          bookingDate: bookingContext.bookingDate,
          bookingTime: bookingContext.bookingTime,
          bookingModel: bookingContext.bookingModel,
        },
      );
      if (!ok) return;
    }

    const metrics = scoreCombination(sortedGroup, partySize, tableMap, false);
    comboByKey.set(key, {
      source: 'auto',
      table_ids: sortedGroup,
      table_names: tablesInGroup.map((table) => table.name),
      combined_capacity: effectiveCapacity,
      spare_covers: Math.max(0, effectiveCapacity - partySize),
      score: metrics.score,
      waste: metrics.waste,
      table_count: sortedGroup.length,
      compactness_area: metrics.compactnessArea,
      auto_override_id: ov?.id,
      requires_manager_approval: ov?.requires_manager_approval,
      internal_notes: ov?.internal_notes ?? undefined,
    });
  };

  for (const table of availableTables) {
    if (table.max_covers < partySize) continue;
    const metrics = scoreCombination([table.id], partySize, tableMap, false);
    singleSuggestions.push({
      source: 'single',
      table_ids: [table.id],
      table_names: [table.name],
      combined_capacity: table.max_covers,
      spare_covers: Math.max(0, table.max_covers - partySize),
      score: metrics.score,
      waste: metrics.waste,
      table_count: 1,
      compactness_area: metrics.compactnessArea,
    });
  }

  const allActiveTables = Array.from(tableMap.values());

  for (const seed of availableTables) {
    const groups = findConnectedGroups(
      seed.id,
      availableTables,
      adjacencyMap,
      partySize,
      maxGroupSize,
      { allActiveTables },
    );
    for (const group of groups) {
      if (group.length < 2) continue;
      const sortedGroup = [...group].sort();
      const ov = autoOverrides?.get(sortedGroup.join('|'));
      pushAutoFromOverride(sortedGroup, ov);
    }
  }

  if (autoOverrides) {
    for (const ov of autoOverrides.values()) {
      if (!ov.locked || ov.disabled) continue;
      const ids = ov.table_group_key.split('|').filter(Boolean);
      if (ids.length < 2) continue;
      const sortedGroup = [...ids].sort((a, b) => a.localeCompare(b));
      if (sortedGroup.join('|') !== ov.table_group_key) continue;
      pushAutoFromOverride(sortedGroup, ov);
    }
  }

  for (const manual of manualCombinations) {
    if (manual.is_active === false) continue;
    const memberIds = [...manual.table_ids].sort();
    if (memberIds.length < 2) continue;
    if (memberIds.some((tableId) => !availableSet.has(tableId))) continue;
    if (manual.combined_max_covers < partySize || manual.combined_min_covers > partySize) continue;

    if (bookingContext) {
      const ok = isCombinationAllowedForBookingContext(
        {
          days_of_week: manual.days_of_week ?? [...ALL_DAYS_OF_WEEK],
          time_start: manual.time_start ?? null,
          time_end: manual.time_end ?? null,
          booking_type_filters: manual.booking_type_filters ?? null,
          requires_manager_approval: manual.requires_manager_approval ?? false,
        },
        {
          bookingDate: bookingContext.bookingDate,
          bookingTime: bookingContext.bookingTime,
          bookingModel: bookingContext.bookingModel,
        },
      );
      if (!ok) continue;
    }

    const tablesInGroup = memberIds.map((tableId) => tableMap.get(tableId)).filter(Boolean) as CombinationTable[];
    const capacity = tablesInGroup.reduce((sum, table) => sum + table.max_covers, 0);
    if (capacity < partySize) continue;

    const key = memberIds.join('|');
    const metrics = scoreCombination(memberIds, partySize, tableMap, true);
    const existing = comboByKey.get(key);
    const manualSuggestion: CombinationSuggestion = {
      source: 'manual',
      table_ids: memberIds,
      table_names: tablesInGroup.map((table) => table.name),
      combined_capacity: capacity,
      spare_covers: Math.max(0, capacity - partySize),
      score: metrics.score,
      waste: metrics.waste,
      table_count: memberIds.length,
      compactness_area: metrics.compactnessArea,
      manual_combination_id: manual.id,
      manual_combination_name: manual.name,
      requires_manager_approval: manual.requires_manager_approval ?? false,
      internal_notes: manual.internal_notes ?? undefined,
    };

    if (!existing || existing.source !== 'manual' || manualSuggestion.score < existing.score) {
      comboByKey.set(key, manualSuggestion);
    }
  }

  singleSuggestions.sort((a, b) => a.combined_capacity - b.combined_capacity || a.score - b.score);
  const comboSuggestions = Array.from(comboByKey.values()).sort((a, b) => a.score - b.score);

  return [...singleSuggestions, ...comboSuggestions];
}
