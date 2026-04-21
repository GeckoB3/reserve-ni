import { describe, expect, it } from 'vitest';
import {
  detectAdjacentTables,
  enumerateAdjacentCombinationGroups,
  findConnectedGroups,
  findValidCombinations,
  getBoundingBoxGap,
  getRotatedBoundingBox,
  infiniteLineIntersectsAabb,
  isValidAxisAlignedCombinationPair,
  isValidCombinationAdjacencyPair,
  isValidCollinearCombinationGroup,
  scoreCombination,
  type AutoCombinationOverrideInput,
  type CombinationTable,
} from './combination-engine';
import { tableGroupKeyFromIds } from './combination-rules';

function makeTable(
  id: string,
  x: number,
  y: number,
  width = 100,
  height = 60,
  maxCovers = 4,
  rotation = 0
): CombinationTable {
  return {
    id,
    name: `T${id}`,
    max_covers: maxCovers,
    position_x: x,
    position_y: y,
    width,
    height,
    rotation,
    is_active: true,
  };
}

describe('getRotatedBoundingBox', () => {
  it('returns axis-aligned box when rotation is zero', () => {
    const box = getRotatedBoundingBox(makeTable('1', 10, 20, 100, 50, 4, 0));
    expect(box).toEqual({ left: 10, right: 110, top: 20, bottom: 70 });
  });

  it('expands extents for a rotated rectangle', () => {
    const box45 = getRotatedBoundingBox(makeTable('1', 0, 0, 100, 50, 4, 45));
    const box90 = getRotatedBoundingBox(makeTable('1', 0, 0, 100, 50, 4, 90));
    expect(box45.right - box45.left).toBeGreaterThan(100);
    expect(box45.bottom - box45.top).toBeGreaterThan(50);
    expect(Math.round(box90.right - box90.left)).toBe(50);
    expect(Math.round(box90.bottom - box90.top)).toBe(100);
  });
});

describe('getBoundingBoxGap', () => {
  it('returns zero when boxes touch', () => {
    const a = { left: 0, right: 100, top: 0, bottom: 100 };
    const b = { left: 100, right: 200, top: 0, bottom: 100 };
    expect(getBoundingBoxGap(a, b)).toBe(0);
  });

  it('returns positive value for separated boxes', () => {
    const a = { left: 0, right: 100, top: 0, bottom: 100 };
    const b = { left: 140, right: 240, top: 0, bottom: 100 };
    expect(getBoundingBoxGap(a, b)).toBe(40);
  });
});

describe('detectAdjacentTables', () => {
  it('detects near tables and excludes far tables by threshold', () => {
    const tables = [
      makeTable('a', 0, 0, 100, 60),
      makeTable('b', 100, 0, 100, 60),
      makeTable('c', 340, 0, 100, 60),
    ];
    const adjacency = detectAdjacentTables(tables, 80);
    expect(adjacency.get('a')?.has('b')).toBe(true);
    expect(adjacency.get('a')?.has('c')).toBe(false);
  });

  it('handles rotated table adjacency', () => {
    const tables = [
      makeTable('a', 0, 0, 100, 60, 4, 45),
      makeTable('b', 120, 0, 100, 60),
    ];
    const adjacency = detectAdjacentTables(tables, 80);
    expect(adjacency.get('a')?.has('b')).toBe(true);
  });

  it('does not make adjacency transitive', () => {
    const tables = [
      makeTable('a', 0, 0),
      makeTable('b', 100, 0),
      makeTable('c', 200, 0),
    ];
    const adjacency = detectAdjacentTables(tables, 20);
    expect(adjacency.get('a')?.has('b')).toBe(true);
    expect(adjacency.get('b')?.has('c')).toBe(true);
    expect(adjacency.get('a')?.has('c')).toBe(false);
  });

  it('rejects diagonally offset pairs even when Euclidean gap is within the threshold', () => {
    const tables = [
      makeTable('a', 0, 0, 100, 60),
      makeTable('b', 105, 70, 100, 60),
    ];
    const adjacency = detectAdjacentTables(tables, 120);
    expect(adjacency.get('a')?.has('b')).toBe(false);
  });

  it('accepts same-row neighbours (horizontal alignment)', () => {
    const tables = [
      makeTable('a', 0, 0, 100, 60),
      makeTable('b', 105, 0, 100, 60),
    ];
    const adjacency = detectAdjacentTables(tables, 80);
    expect(adjacency.get('a')?.has('b')).toBe(true);
  });

  it('accepts same-column neighbours (vertical alignment)', () => {
    const tables = [
      makeTable('a', 0, 0, 100, 60),
      makeTable('b', 0, 70, 100, 60),
    ];
    const adjacency = detectAdjacentTables(tables, 80);
    expect(adjacency.get('a')?.has('b')).toBe(true);
  });

  it('rejects corner-only contact (no shared edge segment)', () => {
    const tables = [
      makeTable('a', 0, 0, 100, 50),
      makeTable('b', 100, 50, 100, 50),
    ];
    const adjacency = detectAdjacentTables(tables, 10);
    expect(adjacency.get('a')?.has('b')).toBe(false);
  });
});

describe('isValidCombinationAdjacencyPair', () => {
  it('returns true when both axial gaps are positive (diagonal separation) but gap is in range', () => {
    const a = { left: 0, right: 100, top: 0, bottom: 60 };
    const b = { left: 105, right: 205, top: 70, bottom: 130 };
    expect(isValidCombinationAdjacencyPair(a, b)).toBe(true);
  });

  it('returns false for corner-only point contact', () => {
    const a = { left: 0, right: 100, top: 0, bottom: 50 };
    const b = { left: 100, right: 200, top: 50, bottom: 100 };
    expect(isValidCombinationAdjacencyPair(a, b)).toBe(false);
  });
});

describe('isValidAxisAlignedCombinationPair', () => {
  it('returns false when both axial gaps are positive (diagonal)', () => {
    const a = { left: 0, right: 100, top: 0, bottom: 60 };
    const b = { left: 105, right: 205, top: 70, bottom: 130 };
    expect(isValidAxisAlignedCombinationPair(a, b)).toBe(false);
  });

  it('returns true when separated only along x (same row)', () => {
    const a = { left: 0, right: 100, top: 0, bottom: 60 };
    const b = { left: 105, right: 205, top: 0, bottom: 60 };
    expect(isValidAxisAlignedCombinationPair(a, b)).toBe(true);
  });

  it('returns true when separated only along y (same column)', () => {
    const a = { left: 0, right: 100, top: 0, bottom: 60 };
    const b = { left: 0, right: 100, top: 70, bottom: 130 };
    expect(isValidAxisAlignedCombinationPair(a, b)).toBe(true);
  });
});

describe('findConnectedGroups', () => {
  it('rejects L-shaped triples when centres are not collinear', () => {
    const tables = [
      makeTable('a', 0, 0, 100, 60, 2),
      makeTable('b', 100, 0, 100, 60, 2),
      makeTable('c', 100, 100, 100, 60, 2),
    ];
    const adjacency = new Map<string, Set<string>>([
      ['a', new Set(['b'])],
      ['b', new Set(['a', 'c'])],
      ['c', new Set(['b'])],
    ]);
    const groups = findConnectedGroups('a', tables, adjacency, 6, 4);
    const keys = groups.map((group) => [...group].sort().join('|'));
    expect(keys).not.toContain('a|b|c');
  });

  it('accepts collinear triples when graph-connected', () => {
    const tables = [
      makeTable('a', 0, 0, 100, 60, 2),
      makeTable('b', 100, 0, 100, 60, 2),
      makeTable('c', 200, 0, 100, 60, 2),
    ];
    const adjacency = new Map<string, Set<string>>([
      ['a', new Set(['b'])],
      ['b', new Set(['a', 'c'])],
      ['c', new Set(['b'])],
    ]);
    const groups = findConnectedGroups('a', tables, adjacency, 6, 4);
    const keys = groups.map((group) => [...group].sort().join('|'));
    expect(keys).toContain('a|b|c');
  });
});

describe('scoreCombination', () => {
  it('gives lower score to manual combination when otherwise equivalent', () => {
    const tableMap = new Map<string, CombinationTable>([
      ['a', makeTable('a', 0, 0, 100, 60, 4)],
      ['b', makeTable('b', 100, 0, 100, 60, 4)],
    ]);
    const auto = scoreCombination(['a', 'b'], 6, tableMap, false);
    const manual = scoreCombination(['a', 'b'], 6, tableMap, true);
    expect(manual.score).toBeLessThan(auto.score);
  });
});

function makeAutoOverride(
  tableIds: string[],
  partial: Partial<AutoCombinationOverrideInput>,
): AutoCombinationOverrideInput {
  const key = tableGroupKeyFromIds(tableIds);
  return {
    id: `ov-${key}`,
    table_group_key: key,
    disabled: false,
    locked: false,
    display_name: null,
    combined_min_covers: null,
    combined_max_covers: null,
    days_of_week: [1, 2, 3, 4, 5, 6, 7],
    time_start: null,
    time_end: null,
    booking_type_filters: null,
    requires_manager_approval: false,
    internal_notes: null,
    ...partial,
  };
}

describe('enumerateAdjacentCombinationGroups', () => {
  it('lists pairs when no other table lies on the line between them', () => {
    const tables = [makeTable('a', 0, 0, 100, 60), makeTable('b', 100, 0, 100, 60)];
    const adjacency = new Map<string, Set<string>>([
      ['a', new Set(['b'])],
      ['b', new Set(['a'])],
    ]);
    const groups = enumerateAdjacentCombinationGroups(adjacency, 4, tables);
    expect(groups.map((g) => g.join('|')).sort()).toContain('a|b');
  });

  it('lists pairs and a triple on the same row when no outsider blocks the centre segment', () => {
    const tables = [
      makeTable('a', 0, 0, 100, 60),
      makeTable('b', 100, 0, 100, 60),
      makeTable('c', 200, 0, 100, 60),
    ];
    const adjacency = new Map<string, Set<string>>([
      ['a', new Set(['b'])],
      ['b', new Set(['a', 'c'])],
      ['c', new Set(['b'])],
    ]);
    const groups = enumerateAdjacentCombinationGroups(adjacency, 4, tables);
    const keys = groups.map((g) => g.join('|')).sort();
    expect(keys).toContain('a|b|c');
    expect(keys).toContain('a|b');
    expect(keys).toContain('b|c');
    expect(keys).not.toContain('a|c');
  });

  it('omits L-shaped triples that are connected but not collinear', () => {
    const tables = [
      makeTable('a', 0, 0, 100, 60),
      makeTable('b', 100, 0, 100, 60),
      makeTable('c', 100, 100, 100, 60),
    ];
    const adjacency = new Map<string, Set<string>>([
      ['a', new Set(['b'])],
      ['b', new Set(['a', 'c'])],
      ['c', new Set(['b'])],
    ]);
    const groups = enumerateAdjacentCombinationGroups(adjacency, 4, tables);
    const keys = groups.map((g) => g.join('|')).sort();
    expect(keys).toContain('a|b');
    expect(keys).toContain('b|c');
    expect(keys).not.toContain('a|b|c');
  });
});

describe('isValidCollinearCombinationGroup', () => {
  it('rejects when the centre segment between outer members intersects another table on the row', () => {
    const tables = [
      makeTable('a', 0, 0, 80, 60),
      makeTable('d', 120, 0, 80, 60),
      makeTable('b', 240, 0, 80, 60),
      makeTable('c', 360, 0, 80, 60),
    ];
    const boxesById = new Map(tables.map((t) => [t.id, getRotatedBoundingBox(t)]));
    expect(isValidCollinearCombinationGroup(['a', 'b', 'c'], boxesById, tables)).toBe(false);
  });

  it('accepts a straight row when no other table blocks the segment', () => {
    const tables = [
      makeTable('a', 0, 0, 80, 60),
      makeTable('b', 240, 0, 80, 60),
      makeTable('c', 360, 0, 80, 60),
    ];
    const boxesById = new Map(tables.map((t) => [t.id, getRotatedBoundingBox(t)]));
    expect(isValidCollinearCombinationGroup(['a', 'b', 'c'], boxesById, tables)).toBe(true);
  });

  it('accepts a pair on a row while other tables exist on the same row outside the segment', () => {
    const tables = [
      makeTable('t1', 0, 0, 80, 60),
      makeTable('t2', 100, 0, 80, 60),
      makeTable('t3', 200, 0, 80, 60),
      makeTable('t4', 300, 0, 80, 60),
    ];
    const boxesById = new Map(tables.map((t) => [t.id, getRotatedBoundingBox(t)]));
    expect(isValidCollinearCombinationGroup(['t1', 't2'], boxesById, tables)).toBe(true);
    expect(isValidCollinearCombinationGroup(['t1', 't2', 't3'], boxesById, tables)).toBe(true);
  });

  it('rejects diagonal alignment (not horizontal or vertical)', () => {
    const tables = [
      makeTable('a', 0, 0, 80, 60),
      makeTable('b', 100, 100, 80, 60),
    ];
    const boxesById = new Map(tables.map((t) => [t.id, getRotatedBoundingBox(t)]));
    expect(isValidCollinearCombinationGroup(['a', 'b'], boxesById, tables)).toBe(false);
  });
});

describe('infiniteLineIntersectsAabb', () => {
  it('returns false when the line misses the box', () => {
    const farBox = { left: 100, right: 110, top: 100, bottom: 110 };
    expect(infiniteLineIntersectsAabb({ x: 0, y: 0 }, { x: 1, y: 0 }, farBox)).toBe(false);
  });

  it('returns true when the horizontal line passes through the box', () => {
    const box = { left: 0, right: 100, top: 0, bottom: 60 };
    expect(infiniteLineIntersectsAabb({ x: -50, y: 30 }, { x: 200, y: 30 }, box)).toBe(true);
  });
});

describe('findValidCombinations', () => {
  it('returns singles first, then combinations', () => {
    const tables = [
      makeTable('a', 0, 0, 100, 60, 6),
      makeTable('b', 120, 0, 100, 60, 4),
      makeTable('c', 240, 0, 100, 60, 4),
    ];
    const adjacency = detectAdjacentTables(tables, 80);
    const results = findValidCombinations({
      partySize: 5,
      datetime: '2026-03-11T18:00:00.000Z',
      durationMinutes: 90,
      tables,
      bookings: [],
      blocks: [],
      adjacencyMap: adjacency,
      manualCombinations: [],
    });
    expect(results[0]?.source).toBe('single');
    expect(results[0]?.table_ids).toEqual(['a']);
  });

  it('includes manual combinations and tags source', () => {
    const tables = [
      makeTable('a', 0, 0, 100, 60, 4),
      makeTable('b', 120, 0, 100, 60, 4),
    ];
    const results = findValidCombinations({
      partySize: 7,
      datetime: '2026-03-11T18:00:00.000Z',
      durationMinutes: 90,
      tables,
      bookings: [],
      blocks: [],
      adjacencyMap: detectAdjacentTables(tables, 80),
      manualCombinations: [
        {
          id: 'manual-1',
          name: 'A + B',
          table_ids: ['a', 'b'],
          combined_min_covers: 2,
          combined_max_covers: 8,
          is_active: true,
        },
      ],
    });

    const manual = results.find((result) => result.source === 'manual');
    expect(manual).toBeTruthy();
    expect(manual?.table_ids).toEqual(['a', 'b']);
  });

  it('excludes an auto combination when the override is disabled', () => {
    const tables = [
      makeTable('a', 0, 0, 100, 60, 4),
      makeTable('b', 100, 0, 100, 60, 4),
    ];
    const adjacency = detectAdjacentTables(tables, 80);
    const key = tableGroupKeyFromIds(['a', 'b']);
    const overrides = new Map<string, AutoCombinationOverrideInput>([
      [key, makeAutoOverride(['a', 'b'], { disabled: true })],
    ]);
    const results = findValidCombinations({
      partySize: 6,
      datetime: '2026-03-11T18:00:00.000Z',
      durationMinutes: 90,
      tables,
      bookings: [],
      blocks: [],
      adjacencyMap: adjacency,
      manualCombinations: [],
      autoOverrides: overrides,
    });
    expect(results.some((r) => r.source === 'auto' && r.table_ids.join('|') === key)).toBe(false);
  });

  it('sets requires_manager_approval on auto suggestions from overrides', () => {
    const tables = [
      makeTable('a', 0, 0, 100, 60, 4),
      makeTable('b', 100, 0, 100, 60, 4),
    ];
    const adjacency = detectAdjacentTables(tables, 80);
    const key = tableGroupKeyFromIds(['a', 'b']);
    const overrides = new Map<string, AutoCombinationOverrideInput>([
      [key, makeAutoOverride(['a', 'b'], { requires_manager_approval: true })],
    ]);
    const results = findValidCombinations({
      partySize: 6,
      datetime: '2026-03-11T18:00:00.000Z',
      durationMinutes: 90,
      tables,
      bookings: [],
      blocks: [],
      adjacencyMap: adjacency,
      manualCombinations: [],
      autoOverrides: overrides,
      bookingContext: {
        bookingDate: '2026-03-11',
        bookingTime: '18:00',
        bookingModel: 'table_reservation',
      },
    });
    const auto = results.find((r) => r.source === 'auto' && r.table_ids.join('|') === key);
    expect(auto?.requires_manager_approval).toBe(true);
  });

  it('respects combined_max_covers override for party size', () => {
    const tables = [
      makeTable('a', 0, 0, 100, 60, 4),
      makeTable('b', 100, 0, 100, 60, 4),
    ];
    const adjacency = detectAdjacentTables(tables, 80);
    const key = tableGroupKeyFromIds(['a', 'b']);
    const overrides = new Map<string, AutoCombinationOverrideInput>([
      [key, makeAutoOverride(['a', 'b'], { combined_max_covers: 6 })],
    ]);
    const blocked = findValidCombinations({
      partySize: 8,
      datetime: '2026-03-11T18:00:00.000Z',
      durationMinutes: 90,
      tables,
      bookings: [],
      blocks: [],
      adjacencyMap: adjacency,
      manualCombinations: [],
      autoOverrides: overrides,
    });
    expect(blocked.some((r) => r.source === 'auto' && r.table_ids.join('|') === key)).toBe(false);

    const allowed = findValidCombinations({
      partySize: 6,
      datetime: '2026-03-11T18:00:00.000Z',
      durationMinutes: 90,
      tables,
      bookings: [],
      blocks: [],
      adjacencyMap: adjacency,
      manualCombinations: [],
      autoOverrides: overrides,
    });
    expect(allowed.some((r) => r.source === 'auto' && r.table_ids.join('|') === key)).toBe(true);
  });

  it('includes a locked auto override when the group is no longer adjacent', () => {
    const tables = [
      makeTable('a', 0, 0, 100, 60, 4),
      makeTable('b', 500, 0, 100, 60, 4),
    ];
    const adjacency = detectAdjacentTables(tables, 80);
    expect(adjacency.get('a')?.has('b')).toBe(false);
    const key = tableGroupKeyFromIds(['a', 'b']);
    const overrides = new Map<string, AutoCombinationOverrideInput>([
      [key, makeAutoOverride(['a', 'b'], { locked: true })],
    ]);
    const results = findValidCombinations({
      partySize: 6,
      datetime: '2026-03-11T18:00:00.000Z',
      durationMinutes: 90,
      tables,
      bookings: [],
      blocks: [],
      adjacencyMap: adjacency,
      manualCombinations: [],
      autoOverrides: overrides,
    });
    const auto = results.find((r) => r.source === 'auto' && r.table_ids.join('|') === key);
    expect(auto).toBeTruthy();
  });
});
