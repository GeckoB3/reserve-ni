import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getVenueStaff, requireAdmin } from '@/lib/venue-auth';
import { detectAdjacentTables, type CombinationTable } from '@/lib/table-management/combination-engine';

export async function POST() {
  const supabase = await createClient();
  const staff = await getVenueStaff(supabase);
  if (!requireAdmin(staff)) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  const [{ data: venue }, { data: tables, error: tablesError }] = await Promise.all([
    staff.db
      .from('venues')
      .select('combination_threshold')
      .eq('id', staff.venue_id)
      .single(),
    staff.db
      .from('venue_tables')
      .select('id, name, max_covers, is_active, position_x, position_y, width, height, rotation')
      .eq('venue_id', staff.venue_id)
      .eq('is_active', true),
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

  return NextResponse.json({
    adjacent_pairs: Math.floor(directedEdges / 2),
    threshold,
  });
}
