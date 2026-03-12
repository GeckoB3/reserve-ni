import { describe, expect, it } from 'vitest';
import {
  detectAdjacentTables,
  findConnectedGroups,
  findValidCombinations,
  getBoundingBoxGap,
  getRotatedBoundingBox,
  scoreCombination,
  type CombinationTable,
} from './combination-engine';

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
});

describe('findConnectedGroups', () => {
  it('finds connected groups up to target capacity', () => {
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
});
