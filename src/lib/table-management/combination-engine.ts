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
}

const ACTIVE_BOOKING_STATUSES = new Set(['Pending', 'Confirmed', 'Seated']);

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
      const gap = getBoundingBoxGap(boxes.get(a.id)!, boxes.get(b.id)!);
      if (gap <= threshold) {
        adjacency.get(a.id)!.add(b.id);
        adjacency.get(b.id)!.add(a.id);
      }
    }
  }

  return adjacency;
}

export function findConnectedGroups(
  seedTableId: string,
  availableTables: CombinationTable[],
  adjacencyMap: Map<string, Set<string>>,
  targetCapacity: number,
  maxGroupSize = 4
): string[][] {
  const tableMap = new Map(availableTables.map((table) => [table.id, table]));
  const availableSet = new Set(availableTables.map((table) => table.id));
  if (!tableMap.has(seedTableId)) return [];

  const results: string[][] = [];
  const queue: string[][] = [[seedTableId]];
  const seen = new Set<string>([seedTableId]);

  while (queue.length > 0) {
    const group = queue.shift()!;
    const groupSet = new Set(group);
    const capacity = group.reduce((sum, tableId) => sum + (tableMap.get(tableId)?.max_covers ?? 0), 0);
    if (capacity >= targetCapacity) {
      results.push(group);
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

  for (const seed of availableTables) {
    const groups = findConnectedGroups(
      seed.id,
      availableTables,
      adjacencyMap,
      partySize,
      maxGroupSize
    );
    for (const group of groups) {
      if (group.length < 2) continue;
      const sortedGroup = [...group].sort();
      const key = sortedGroup.join('|');
      const tablesInGroup = sortedGroup.map((tableId) => tableMap.get(tableId)).filter(Boolean) as CombinationTable[];
      const capacity = tablesInGroup.reduce((sum, table) => sum + table.max_covers, 0);
      if (capacity < partySize) continue;
      const metrics = scoreCombination(sortedGroup, partySize, tableMap, false);
      comboByKey.set(key, {
        source: 'auto',
        table_ids: sortedGroup,
        table_names: tablesInGroup.map((table) => table.name),
        combined_capacity: capacity,
        spare_covers: Math.max(0, capacity - partySize),
        score: metrics.score,
        waste: metrics.waste,
        table_count: sortedGroup.length,
        compactness_area: metrics.compactnessArea,
      });
    }
  }

  for (const manual of manualCombinations) {
    if (manual.is_active === false) continue;
    const memberIds = [...manual.table_ids].sort();
    if (memberIds.length < 2) continue;
    if (memberIds.some((tableId) => !availableSet.has(tableId))) continue;
    if (manual.combined_max_covers < partySize || manual.combined_min_covers > partySize) continue;

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
    };

    if (!existing || existing.source !== 'manual' || manualSuggestion.score < existing.score) {
      comboByKey.set(key, manualSuggestion);
    }
  }

  singleSuggestions.sort((a, b) => a.combined_capacity - b.combined_capacity || a.score - b.score);
  const comboSuggestions = Array.from(comboByKey.values()).sort((a, b) => a.score - b.score);

  return [...singleSuggestions, ...comboSuggestions];
}
