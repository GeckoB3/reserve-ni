/**
 * Table snap-together detection and management.
 *
 * All spatial calculations operate in **pixel** coordinates.
 * The calling code is responsible for converting percentage positions
 * to pixels before invoking these helpers.
 */

import { allocateSeatsToEdges } from './seat-positions';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SnapSide = 'top' | 'right' | 'bottom' | 'left';

export interface SnapTableBounds {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  shape: string;
  snap_group_id: string | null;
  snap_sides: string[] | null;
  max_covers: number;
  name: string;
}

export interface SnapDetectResult {
  targetTableId: string;
  draggedSide: SnapSide;
  targetSide: SnapSide;
  snapX: number;
  snapY: number;
}

export interface SnapGroupUpdate {
  groupId: string;
  tableUpdates: Array<{
    id: string;
    snap_group_id: string;
    snap_sides: string[];
    position_x?: number;
    position_y?: number;
  }>;
  combinedMaxCovers: number;
  combinationName: string;
}

export interface SnapRemoveUpdate {
  clearedIds: string[];
  remainingGroup: SnapGroupUpdate | null;
}

// ---------------------------------------------------------------------------
// detectSnap
// ---------------------------------------------------------------------------

/**
 * Checks whether the dragged table can snap-join to any nearby table.
 *
 * Only rectangular / square tables participate in snapping — circles and
 * ovals are skipped.  Returns the best candidate (most overlap) or `null`.
 */
export function detectSnap(
  dragged: SnapTableBounds,
  allTables: SnapTableBounds[],
  snapThreshold = 20,
): SnapDetectResult | null {
  if (dragged.shape === 'circle' || dragged.shape === 'oval') return null;

  const dL = dragged.x - dragged.w / 2;
  const dR = dragged.x + dragged.w / 2;
  const dT = dragged.y - dragged.h / 2;
  const dB = dragged.y + dragged.h / 2;

  interface Candidate extends SnapDetectResult { overlap: number }
  const candidates: Candidate[] = [];

  for (const other of allTables) {
    if (other.id === dragged.id) continue;
    if (other.shape === 'circle' || other.shape === 'oval') continue;
    if (dragged.snap_group_id && dragged.snap_group_id === other.snap_group_id) continue;

    const oL = other.x - other.w / 2;
    const oR = other.x + other.w / 2;
    const oT = other.y - other.h / 2;
    const oB = other.y + other.h / 2;

    // dragged.right ↔ other.left
    if (Math.abs(dR - oL) < snapThreshold) {
      const overlap = Math.max(0, Math.min(dB, oB) - Math.max(dT, oT));
      if (overlap >= 0.5 * Math.min(dragged.h, other.h)) {
        candidates.push({
          targetTableId: other.id,
          draggedSide: 'right',
          targetSide: 'left',
          snapX: oL - dragged.w / 2,
          snapY: other.y,
          overlap,
        });
      }
    }

    // dragged.left ↔ other.right
    if (Math.abs(dL - oR) < snapThreshold) {
      const overlap = Math.max(0, Math.min(dB, oB) - Math.max(dT, oT));
      if (overlap >= 0.5 * Math.min(dragged.h, other.h)) {
        candidates.push({
          targetTableId: other.id,
          draggedSide: 'left',
          targetSide: 'right',
          snapX: oR + dragged.w / 2,
          snapY: other.y,
          overlap,
        });
      }
    }

    // dragged.bottom ↔ other.top
    if (Math.abs(dB - oT) < snapThreshold) {
      const overlap = Math.max(0, Math.min(dR, oR) - Math.max(dL, oL));
      if (overlap >= 0.5 * Math.min(dragged.w, other.w)) {
        candidates.push({
          targetTableId: other.id,
          draggedSide: 'bottom',
          targetSide: 'top',
          snapX: other.x,
          snapY: oT - dragged.h / 2,
          overlap,
        });
      }
    }

    // dragged.top ↔ other.bottom
    if (Math.abs(dT - oB) < snapThreshold) {
      const overlap = Math.max(0, Math.min(dR, oR) - Math.max(dL, oL));
      if (overlap >= 0.5 * Math.min(dragged.w, other.w)) {
        candidates.push({
          targetTableId: other.id,
          draggedSide: 'top',
          targetSide: 'bottom',
          snapX: other.x,
          snapY: oB + dragged.h / 2,
          overlap,
        });
      }
    }
  }

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.overlap - a.overlap);
  return candidates[0]!;
}

// ---------------------------------------------------------------------------
// buildSnapGroup
// ---------------------------------------------------------------------------

/**
 * Computes the full group state after snapping two tables together.
 *
 * If the target is already in a group, the dragged table joins that group.
 * If neither is in a group, a new group is created.
 */
export function buildSnapGroup(
  draggedId: string,
  snapResult: SnapDetectResult,
  allTables: SnapTableBounds[],
): SnapGroupUpdate {
  const target = allTables.find((t) => t.id === snapResult.targetTableId)!;
  const dragged = allTables.find((t) => t.id === draggedId)!;

  // Always prefer the target's group. If dragged is switching groups, it leaves
  // its old group (the caller handles cleanup of the old group separately).
  const groupId = target.snap_group_id ?? crypto.randomUUID();

  // Collect all tables in the group
  const groupTableIds = new Set<string>();
  for (const t of allTables) {
    if (t.snap_group_id === groupId) groupTableIds.add(t.id);
  }
  groupTableIds.add(draggedId);
  groupTableIds.add(snapResult.targetTableId);

  // Build updated snap_sides for each table
  const sidesMap = new Map<string, Set<string>>();
  for (const id of groupTableIds) {
    const t = allTables.find((tb) => tb.id === id)!;
    sidesMap.set(id, new Set(t.snap_sides ?? []));
  }

  // Add the new join sides
  sidesMap.get(draggedId)!.add(snapResult.draggedSide);
  sidesMap.get(snapResult.targetTableId)!.add(snapResult.targetSide);

  const groupTables = allTables.filter((t) => groupTableIds.has(t.id));

  const tableUpdates = groupTables.map((t) => ({
    id: t.id,
    snap_group_id: groupId,
    snap_sides: Array.from(sidesMap.get(t.id)!),
  }));

  // Build combined covers using each table's per-side seat allocation
  const combinedMaxCovers = calculateCombinedCovers(
    groupTables.map((t) => ({
      max_covers: t.max_covers,
      w: t.w,
      h: t.h,
      snap_sides: Array.from(sidesMap.get(t.id)!),
    })),
  );

  const combinationName = groupTables.map((t) => t.name).join(' + ');

  return { groupId, tableUpdates, combinedMaxCovers, combinationName };
}

// ---------------------------------------------------------------------------
// removeFromSnapGroup
// ---------------------------------------------------------------------------

/**
 * Computes the state after removing a table from its snap group.
 *
 * If only one table remains, the group is dissolved entirely.
 */
export function removeFromSnapGroup(
  tableId: string,
  allTables: SnapTableBounds[],
): SnapRemoveUpdate {
  const table = allTables.find((t) => t.id === tableId);
  if (!table || !table.snap_group_id) {
    return { clearedIds: [tableId], remainingGroup: null };
  }

  const groupId = table.snap_group_id;
  const groupTables = allTables.filter(
    (t) => t.snap_group_id === groupId && t.id !== tableId,
  );

  // Clear sides that face the departing table
  const sidesMap = new Map<string, Set<string>>();
  for (const gt of groupTables) {
    const sides = new Set(gt.snap_sides ?? []);
    // Remove the side that was joined to the departing table.
    // We determine this by checking adjacency: which side of gt faced the
    // departing table?
    const depL = table.x - table.w / 2;
    const depR = table.x + table.w / 2;
    const depT = table.y - table.h / 2;
    const depB = table.y + table.h / 2;
    const gtL = gt.x - gt.w / 2;
    const gtR = gt.x + gt.w / 2;
    const gtT = gt.y - gt.h / 2;
    const gtB = gt.y + gt.h / 2;
    const tol = 4;

    if (Math.abs(gtR - depL) < tol) sides.delete('right');
    if (Math.abs(gtL - depR) < tol) sides.delete('left');
    if (Math.abs(gtB - depT) < tol) sides.delete('bottom');
    if (Math.abs(gtT - depB) < tol) sides.delete('top');

    sidesMap.set(gt.id, sides);
  }

  const clearedIds = [tableId];

  if (groupTables.length <= 1) {
    // Group dissolves
    for (const gt of groupTables) clearedIds.push(gt.id);
    return { clearedIds, remainingGroup: null };
  }

  // Remaining group still valid
  const combinedMaxCovers = calculateCombinedCovers(
    groupTables.map((t) => ({
      max_covers: t.max_covers,
      w: t.w,
      h: t.h,
      snap_sides: Array.from(sidesMap.get(t.id)!),
    })),
  );

  const combinationName = groupTables.map((t) => t.name).join(' + ');

  return {
    clearedIds,
    remainingGroup: {
      groupId,
      tableUpdates: groupTables.map((t) => ({
        id: t.id,
        snap_group_id: groupId,
        snap_sides: Array.from(sidesMap.get(t.id)!),
      })),
      combinedMaxCovers,
      combinationName,
    },
  };
}

// ---------------------------------------------------------------------------
// Combined covers
// ---------------------------------------------------------------------------

function calculateCombinedCovers(
  tables: Array<{
    max_covers: number;
    w: number;
    h: number;
    snap_sides: string[];
  }>,
): number {
  let total = 0;
  let removed = 0;

  for (const t of tables) {
    total += t.max_covers;
    if (t.snap_sides.length > 0) {
      const alloc = allocateSeatsToEdges(t.max_covers, t.w, t.h);
      for (const side of t.snap_sides) {
        removed += alloc[side as SnapSide] ?? 0;
      }
    }
  }

  return Math.max(1, total - removed);
}

// ---------------------------------------------------------------------------
// Group outline
// ---------------------------------------------------------------------------

/**
 * Returns a flat array of [x,y,…] points tracing the bounding rectangle
 * around a group of tables.  Intended for use with Konva `Line` (`closed`).
 */
export function calculateGroupOutline(
  tables: Array<{ x: number; y: number; w: number; h: number }>,
): number[] {
  if (tables.length === 0) return [];
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  for (const t of tables) {
    minX = Math.min(minX, t.x - t.w / 2);
    maxX = Math.max(maxX, t.x + t.w / 2);
    minY = Math.min(minY, t.y - t.h / 2);
    maxY = Math.max(maxY, t.y + t.h / 2);
  }
  return [minX, minY, maxX, minY, maxX, maxY, minX, maxY];
}
