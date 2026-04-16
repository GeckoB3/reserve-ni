import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getVenueStaff, requireAdmin } from '@/lib/venue-auth';
import {
  detectAdjacentTables,
  enumerateAdjacentCombinationGroups,
  type CombinationTable,
} from '@/lib/table-management/combination-engine';
import { z } from 'zod';

const bodySchema = z.object({ area_id: z.string().uuid().optional() });

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const staff = await getVenueStaff(supabase);
  if (!requireAdmin(staff)) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  let areaId: string | undefined;
  try {
    const json = await request.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(json);
    if (parsed.success) areaId = parsed.data.area_id;
  } catch {
    /* empty body */
  }

  let tablesQuery = staff.db
    .from('venue_tables')
    .select('id, name, max_covers, is_active, position_x, position_y, width, height, rotation')
    .eq('venue_id', staff.venue_id)
    .eq('is_active', true);
  if (areaId) {
    tablesQuery = tablesQuery.eq('area_id', areaId);
  }

  const [{ data: venue }, { data: tables, error: tablesError }] = await Promise.all([
    staff.db
      .from('venues')
      .select('combination_threshold')
      .eq('id', staff.venue_id)
      .single(),
    tablesQuery,
  ]);

  if (tablesError) {
    console.error('Recalculate adjacency failed to load tables:', tablesError);
    return NextResponse.json({ error: 'Failed to load tables' }, { status: 500 });
  }

  const threshold = venue?.combination_threshold ?? 80;
  const tableInputs: CombinationTable[] = (tables ?? []).map((table) => ({
    id: table.id,
    name: table.name,
    max_covers: table.max_covers,
    is_active: table.is_active,
    position_x: table.position_x,
    position_y: table.position_y,
    width: table.width,
    height: table.height,
    rotation: table.rotation,
  }));

  const adjacency = detectAdjacentTables(tableInputs, threshold);
  const directedEdges = Array.from(adjacency.values()).reduce((sum, set) => sum + set.size, 0);
  const autoGroups = enumerateAdjacentCombinationGroups(adjacency, 4, tableInputs);

  return NextResponse.json({
    adjacent_pairs: Math.floor(directedEdges / 2),
    auto_combination_count: autoGroups.length,
    threshold,
  });
}
