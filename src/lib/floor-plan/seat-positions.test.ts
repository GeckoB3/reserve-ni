import { describe, expect, it } from 'vitest';
import { calculateSeatPositions } from './seat-positions';

const rectanglePolygon = [
  { x: -100, y: -40 },
  { x: 100, y: -40 },
  { x: 100, y: 40 },
  { x: -100, y: 40 },
];

describe('calculateSeatPositions polygon seating', () => {
  it('places fewer seats than sides on the longest sides first', () => {
    const seats = calculateSeatPositions('polygon', 200, 80, 3, undefined, rectanglePolygon);

    expect(seats).toHaveLength(3);
    expect(seats.map((s) => ({ x: s.x, y: s.y }))).toEqual([
      { x: 0, y: -40 },
      { x: 100, y: 0 },
      { x: 0, y: 40 },
    ]);
  });

  it('adds second seats to longest sides first and spaces them evenly along each side', () => {
    const seats = calculateSeatPositions('polygon', 200, 80, 6, undefined, rectanglePolygon);

    expect(seats).toHaveLength(6);
    expect(seats.map((s) => ({ x: Math.round(s.x), y: Math.round(s.y) }))).toEqual([
      { x: -33, y: -40 },
      { x: 33, y: -40 },
      { x: 100, y: 0 },
      { x: 33, y: 40 },
      { x: -33, y: 40 },
      { x: -100, y: 0 },
    ]);
  });
});
