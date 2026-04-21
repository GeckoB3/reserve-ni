/**
 * Reshape a polygon table after moving one vertex in table-local, unrotated space
 * (same coordinates as Konva `TableShape` uses for `polygon_points` → pixels).
 */

export interface ReshapePolygonVertexInput {
  polygon_points: { x: number; y: number }[];
  widthPct: number;
  heightPct: number;
  canvasWidth: number;
  canvasHeight: number;
  positionXPct: number | null;
  positionYPct: number | null;
  rotationDeg: number | null;
  vertexIndex: number;
  newLocalX: number;
  newLocalY: number;
}

export interface ReshapePolygonVertexResult {
  polygon_points: { x: number; y: number }[];
  width: number;
  height: number;
  position_x: number;
  position_y: number;
}

/** Rotate a local (unrotated) offset by table rotation into canvas delta (y-down). */
function localDeltaToCanvas(dx: number, dy: number, rotationDeg: number): { x: number; y: number } {
  const th = (rotationDeg * Math.PI) / 180;
  const c = Math.cos(th);
  const s = Math.sin(th);
  return {
    x: dx * c - dy * s,
    y: dx * s + dy * c,
  };
}

const MIN_TABLE_BBOX_PCT = 4;
const MIN_POSITION = 2;
const MAX_POSITION = 98;

export function reshapePolygonVertexAtLocalPosition(input: ReshapePolygonVertexInput): ReshapePolygonVertexResult {
  const {
    polygon_points: ptsIn,
    widthPct,
    heightPct,
    canvasWidth: cw,
    canvasHeight: ch,
    positionXPct,
    positionYPct,
    rotationDeg,
    vertexIndex,
    newLocalX,
    newLocalY,
  } = input;

  if (!ptsIn.length || vertexIndex < 0 || vertexIndex >= ptsIn.length) {
    throw new Error('reshapePolygonVertexAtLocalPosition: invalid polygon or vertex index');
  }

  const wPx = (widthPct / 100) * cw;
  const hPx = (heightPct / 100) * ch;

  const locals = ptsIn.map((p) => ({
    x: (p.x / 100 - 0.5) * wPx,
    y: (p.y / 100 - 0.5) * hPx,
  }));

  locals[vertexIndex] = { x: newLocalX, y: newLocalY };

  const xs = locals.map((p) => p.x);
  const ys = locals.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  const rawWpx = Math.max(1e-6, maxX - minX);
  const rawHpx = Math.max(1e-6, maxY - minY);

  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;

  const centered = locals.map((p) => ({ x: p.x - cx, y: p.y - cy }));

  const widthOut = Math.max(MIN_TABLE_BBOX_PCT, Math.round(((rawWpx / cw) * 100) * 10) / 10);
  const heightOut = Math.max(MIN_TABLE_BBOX_PCT, Math.round(((rawHpx / ch) * 100) * 10) / 10);

  const newWpx = (widthOut / 100) * cw;
  const newHpx = (heightOut / 100) * ch;

  const normalised = centered.map((p) => ({
    x: ((p.x + newWpx / 2) / newWpx) * 100,
    y: ((p.y + newHpx / 2) / newHpx) * 100,
  }));

  const pxOld = ((positionXPct ?? 50) / 100) * cw;
  const pyOld = ((positionYPct ?? 50) / 100) * ch;
  const d = localDeltaToCanvas(cx, cy, rotationDeg ?? 0);
  const pxNew = pxOld + d.x;
  const pyNew = pyOld + d.y;

  return {
    polygon_points: normalised,
    width: widthOut,
    height: heightOut,
    position_x: Math.max(MIN_POSITION, Math.min(MAX_POSITION, (pxNew / cw) * 100)),
    position_y: Math.max(MIN_POSITION, Math.min(MAX_POSITION, (pyNew / ch) * 100)),
  };
}
