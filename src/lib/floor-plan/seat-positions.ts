/**
 * Seat position calculation for floor-plan table rendering.
 *
 * Positions are returned as pixel offsets relative to the table centre.
 * The calling component is responsible for converting percentage-based
 * table dimensions to pixels before invoking these helpers.
 */

export interface SeatPosition {
  /** Horizontal offset from the table centre (px). */
  x: number;
  /** Vertical offset from the table centre (px). */
  y: number;
  /** Outward-facing angle in radians (used to offset the dot outside the edge). */
  angle: number;
  /** Which edge of the table this seat belongs to. */
  edgeSide: 'top' | 'right' | 'bottom' | 'left';
}

type EdgeSide = 'top' | 'right' | 'bottom' | 'left';

// ---------------------------------------------------------------------------
// Rectangular seat allocation
// ---------------------------------------------------------------------------

/**
 * Determines how many seats sit on each edge of a rectangular table.
 *
 * Low seat counts use restaurant convention (2-top: seats face each other
 * across the table width). Counts of 5+ use a perimeter-walk distribution
 * that naturally allocates more seats to longer edges.
 */
export function allocateSeatsToEdges(
  seatCount: number,
  width: number,
  height: number,
): Record<EdgeSide, number> {
  const alloc: Record<EdgeSide, number> = { top: 0, right: 0, bottom: 0, left: 0 };
  if (seatCount <= 0) return alloc;

  const isWide = width >= height;

  if (seatCount === 1) {
    alloc[isWide ? 'right' : 'bottom'] = 1;
    return alloc;
  }

  // 2-top: guests sit across from each other on the shorter edges
  if (seatCount === 2) {
    if (isWide) { alloc.left = 1; alloc.right = 1; }
    else { alloc.top = 1; alloc.bottom = 1; }
    return alloc;
  }

  if (seatCount === 3) {
    if (isWide) { alloc.top = 1; alloc.left = 1; alloc.right = 1; }
    else { alloc.right = 1; alloc.top = 1; alloc.bottom = 1; }
    return alloc;
  }

  if (seatCount === 4) {
    alloc.top = 1; alloc.right = 1; alloc.bottom = 1; alloc.left = 1;
    return alloc;
  }

  // 5+ seats — walk the perimeter clockwise from the top-left corner and
  // count how many evenly-spaced seats fall on each edge.
  const perimeter = 2 * (width + height);
  const spacing = perimeter / seatCount;

  for (let i = 0; i < seatCount; i++) {
    const d = i * spacing + spacing / 2;
    if (d < width) alloc.top++;
    else if (d < width + height) alloc.right++;
    else if (d < 2 * width + height) alloc.bottom++;
    else alloc.left++;
  }

  return alloc;
}

/**
 * Distributes `count` seats evenly along a single rectangular edge.
 */
function positionsOnEdge(
  edge: EdgeSide,
  count: number,
  halfW: number,
  halfH: number,
): SeatPosition[] {
  if (count <= 0) return [];
  const seats: SeatPosition[] = [];

  for (let i = 0; i < count; i++) {
    const t = (i + 0.5) / count; // 0→1, centred within each slot
    let x: number, y: number, angle: number;

    switch (edge) {
      case 'top':
        x = -halfW + t * 2 * halfW;
        y = -halfH;
        angle = -Math.PI / 2;
        break;
      case 'right':
        x = halfW;
        y = -halfH + t * 2 * halfH;
        angle = 0;
        break;
      case 'bottom':
        x = halfW - t * 2 * halfW;
        y = halfH;
        angle = Math.PI / 2;
        break;
      case 'left':
        x = -halfW;
        y = halfH - t * 2 * halfH;
        angle = Math.PI;
        break;
    }

    seats.push({ x, y, angle, edgeSide: edge });
  }

  return seats;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Calculates seat positions around a table's perimeter.
 *
 * @param shape       Table shape (`'rectangle'`, `'square'`, `'circle'`, `'oval'`)
 * @param width       Table width in **pixels**
 * @param height      Table height in **pixels**
 * @param maxCovers   Total number of seats
 * @param hiddenSides Optional set of edge names whose seats are omitted
 *                    (used when tables are joined — the joined side loses its seats)
 * @returns Array of seat positions relative to the table centre
 */
export function calculateSeatPositions(
  shape: string,
  width: number,
  height: number,
  maxCovers: number,
  hiddenSides?: Set<string>,
): SeatPosition[] {
  if (maxCovers <= 0 || width <= 0 || height <= 0) return [];

  // ---- Circular / oval tables ----
  if (shape === 'circle' || shape === 'oval') {
    const rx = width / 2;
    const ry = shape === 'oval' ? height / 2 : rx;
    const positions: SeatPosition[] = [];

    for (let i = 0; i < maxCovers; i++) {
      const angle = (2 * Math.PI * i) / maxCovers - Math.PI / 2;
      const x = Math.cos(angle) * rx;
      const y = Math.sin(angle) * ry;

      // Map the angle to a quadrant using clockwise-from-top degrees:
      //   top: 315°–45°,  right: 45°–135°,  bottom: 135°–225°,  left: 225°–315°
      const specDeg = (((angle + Math.PI / 2) * 180) / Math.PI + 360) % 360;
      let edgeSide: EdgeSide;
      if (specDeg < 45 || specDeg >= 315) edgeSide = 'top';
      else if (specDeg < 135) edgeSide = 'right';
      else if (specDeg < 225) edgeSide = 'bottom';
      else edgeSide = 'left';

      if (!hiddenSides?.has(edgeSide)) {
        positions.push({ x, y, angle, edgeSide });
      }
    }

    return positions;
  }

  // ---- Rectangular / square tables ----
  const visibleEdges = (['top', 'right', 'bottom', 'left'] as EdgeSide[]).filter(
    (e) => !hiddenSides?.has(e),
  );
  if (visibleEdges.length === 0) return [];

  let allocation: Record<EdgeSide, number>;

  if (!hiddenSides || hiddenSides.size === 0) {
    allocation = allocateSeatsToEdges(maxCovers, width, height);
  } else {
    // Redistribute all seats to visible sides proportionally by edge length
    allocation = { top: 0, right: 0, bottom: 0, left: 0 };
    const edgeLen: Record<EdgeSide, number> = {
      top: width, right: height, bottom: width, left: height,
    };
    const totalLen = visibleEdges.reduce((s, e) => s + edgeLen[e], 0);
    let placed = 0;

    for (const edge of visibleEdges) {
      const seats = Math.floor(maxCovers * (edgeLen[edge] / totalLen));
      allocation[edge] = seats;
      placed += seats;
    }

    let remaining = maxCovers - placed;
    const sorted = [...visibleEdges].sort((a, b) => edgeLen[b] - edgeLen[a]);
    for (const edge of sorted) {
      if (remaining <= 0) break;
      allocation[edge]++;
      remaining--;
    }
  }

  const halfW = width / 2;
  const halfH = height / 2;
  const positions: SeatPosition[] = [];
  for (const edge of visibleEdges) {
    positions.push(...positionsOnEdge(edge, allocation[edge], halfW, halfH));
  }
  return positions;
}
