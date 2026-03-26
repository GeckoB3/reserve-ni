import { getTableDimensions } from '@/types/table-management';
import type { TableShape } from '@/types/table-management';

/** Minimal table fields needed to compute bounding box in stage coordinates. */
export interface FitViewTableLike {
  position_x: number | null;
  position_y: number | null;
  width: number | null;
  height: number | null;
  max_covers: number;
  shape: string;
}

export interface ComputeStageFitOptions {
  /** Padding around the content bounding box (px). Default 48. */
  padding?: number;
  /** Upper cap on scale (matches wheel zoom max in canvases). Default 3. */
  maxScale?: number;
}

/**
 * Computes Konva Stage `scaleX`/`scaleY` and `x`/`y` so all tables are visible
 * and the plan fills the canvas as much as possible (same math as the booking mini picker).
 */
export function computeStageFitToView(
  tables: FitViewTableLike[],
  canvasW: number,
  canvasH: number,
  options?: ComputeStageFitOptions,
): { scale: number; x: number; y: number } {
  const pad = options?.padding ?? 48;
  const maxScale = options?.maxScale ?? 3;

  if (tables.length === 0 || canvasW < 1 || canvasH < 1) {
    return { scale: 1, x: 0, y: 0 };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const t of tables) {
    const fb = getTableDimensions(t.max_covers, t.shape as TableShape);
    const cx = t.position_x != null ? (t.position_x / 100) * canvasW : canvasW / 2;
    const cy = t.position_y != null ? (t.position_y / 100) * canvasH : canvasH / 2;
    const w = ((t.width ?? fb.width) / 100) * canvasW;
    const h = ((t.height ?? fb.height) / 100) * canvasH;
    minX = Math.min(minX, cx - w / 2);
    maxX = Math.max(maxX, cx + w / 2);
    minY = Math.min(minY, cy - h / 2);
    maxY = Math.max(maxY, cy + h / 2);
  }

  if (!Number.isFinite(minX) || !Number.isFinite(maxX)) {
    return { scale: 1, x: 0, y: 0 };
  }

  const bw = maxX - minX + pad * 2;
  const bh = maxY - minY + pad * 2;
  const scale = Math.min(canvasW / bw, canvasH / bh, maxScale);
  const midX = (minX + maxX) / 2;
  const midY = (minY + maxY) / 2;
  return {
    scale,
    x: canvasW / 2 - midX * scale,
    y: canvasH / 2 - midY * scale,
  };
}
