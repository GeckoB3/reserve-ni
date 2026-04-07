import type { SupabaseClient } from '@supabase/supabase-js';
import { computeGridPositions, getTableDimensions, type TableShape } from '@/types/table-management';

/**
 * When advanced table management is enabled for the first time, place active tables
 * on a simple grid (same logic as the floor plan editor auto-arrange).
 * Skips if any active table already has floor-plan coordinates.
 */
export async function seedDefaultFloorPlanLayoutIfNeeded(
  db: SupabaseClient,
  venueId: string,
): Promise<{ seeded: boolean }> {
  const { data: rows, error } = await db
    .from('venue_tables')
    .select('id, max_covers, shape, width, height, position_x, position_y, is_active')
    .eq('venue_id', venueId)
    .order('sort_order');

  if (error) {
    console.error('seedDefaultFloorPlanLayoutIfNeeded: load venue_tables failed', {
      venueId,
      message: error.message,
    });
    return { seeded: false };
  }

  const active = (rows ?? []).filter((t) => t.is_active);
  if (active.length === 0) return { seeded: false };

  const hasAnyPosition = active.some(
    (t) => t.position_x != null && t.position_y != null,
  );
  if (hasAnyPosition) return { seeded: false };

  const positions = computeGridPositions(
    active.map((t) => ({
      max_covers: t.max_covers,
      shape: t.shape,
      width: t.width,
      height: t.height,
    })),
  );

  const now = new Date().toISOString();

  for (let i = 0; i < active.length; i++) {
    const t = active[i]!;
    const pos = positions[i]!;
    const dims = getTableDimensions(t.max_covers, t.shape as TableShape);

    const { error: upErr } = await db
      .from('venue_tables')
      .update({
        position_x: pos.position_x,
        position_y: pos.position_y,
        width: t.width ?? dims.width,
        height: t.height ?? dims.height,
        updated_at: now,
      })
      .eq('id', t.id)
      .eq('venue_id', venueId);

    if (upErr) {
      console.error('seedDefaultFloorPlanLayoutIfNeeded: update table failed', {
        venueId,
        tableId: t.id,
        message: upErr.message,
      });
      return { seeded: false };
    }
  }

  return { seeded: true };
}
