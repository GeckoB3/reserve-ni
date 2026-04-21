import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getVenueStaff } from '@/lib/venue-auth';
import {
  detectAdjacentTables,
  enumerateAdjacentCombinationGroups,
  type CombinationTable,
} from '@/lib/table-management/combination-engine';
import { tableGroupIdsFromKey, tableGroupKeyFromIds } from '@/lib/table-management/combination-rules';

function defaultComboName(tableNames: string[]): string {
  return tableNames.join(' + ');
}

function catalogAutoGroupFromIds(
  ids: string[],
  tableById: Map<string, CombinationTable>,
  ov: Record<string, unknown> | undefined,
) {
  const key = tableGroupKeyFromIds(ids);
  const names = ids.map((id) => tableById.get(id)?.name ?? id);
  const sumCap = ids.reduce((s, id) => s + (tableById.get(id)?.max_covers ?? 0), 0);
  const disabled = (ov?.disabled as boolean) ?? false;
  const locked = (ov?.locked as boolean) ?? false;
  const hasOverride = Boolean(ov);
  const effMin = (ov?.combined_min_covers as number | null | undefined) ?? null;
  const effMax = (ov?.combined_max_covers as number | null | undefined) ?? null;
  const defaultDays = [1, 2, 3, 4, 5, 6, 7];
  const dayList = (ov?.days_of_week as number[] | undefined) ?? defaultDays;
  const daysModified = [...dayList].sort((a, b) => a - b).join(',') !== defaultDays.join(',');
  const timeModified = Boolean((ov?.time_start as string | null) || (ov?.time_end as string | null));
  const typesModified = Array.isArray(ov?.booking_type_filters) && (ov.booking_type_filters as unknown[]).length > 0;
  const modified =
    hasOverride &&
    !disabled &&
    (locked ||
      effMin != null ||
      effMax != null ||
      Boolean((ov?.display_name as string | null)?.trim()) ||
      Boolean(ov?.requires_manager_approval) ||
      Boolean((ov?.internal_notes as string | null)?.trim()) ||
      daysModified ||
      timeModified ||
      typesModified);

  let status: 'active' | 'disabled' | 'modified' = 'active';
  if (disabled) status = 'disabled';
  else if (modified) status = 'modified';

  return {
    table_group_key: key,
    table_ids: ids,
    default_name: defaultComboName(names),
    default_capacity: sumCap,
    effective_min_covers: effMin ?? 1,
    effective_max_covers: effMax ?? sumCap,
    override: ov ?? null,
    is_locked: locked,
    status,
  };
}

/**
 * GET /api/venue/tables/combinations/catalog
 * Auto-detected adjacent groups + merged override rows for the Combinations UI.
 * Optional `area_id` — when set, only tables and overrides for that dining area (multi-area venues).
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const staff = await getVenueStaff(supabase);
  if (!staff) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  const areaId = request.nextUrl.searchParams.get('area_id');

  let tablesQuery = staff.db
    .from('venue_tables')
    .select('id, name, max_covers, is_active, position_x, position_y, width, height, rotation')
    .eq('venue_id', staff.venue_id)
    .eq('is_active', true)
    .order('sort_order');
  if (areaId) {
    tablesQuery = tablesQuery.eq('area_id', areaId);
  }

  let overridesQuery = staff.db.from('combination_auto_overrides').select('*').eq('venue_id', staff.venue_id);
  if (areaId) {
    overridesQuery = overridesQuery.eq('area_id', areaId);
  }

  const [{ data: venueRow }, { data: tablesData }, { data: overridesData }] = await Promise.all([
    staff.db.from('venues').select('combination_threshold').eq('id', staff.venue_id).single(),
    tablesQuery,
    overridesQuery,
  ]);

  const threshold = venueRow?.combination_threshold ?? 80;
  const tables = (tablesData ?? []) as CombinationTable[];
  const adjacencyMap = detectAdjacentTables(tables, threshold);
  const groups = enumerateAdjacentCombinationGroups(adjacencyMap, 4, tables);

  const tableById = new Map(tables.map((t) => [t.id, t]));
  const overrideByKey = new Map((overridesData ?? []).map((r: { table_group_key: string }) => [r.table_group_key, r]));

  const auto_groups = groups.map((ids) => {
    const key = tableGroupKeyFromIds(ids);
    const ov = overrideByKey.get(key) as Record<string, unknown> | undefined;
    return catalogAutoGroupFromIds(ids, tableById, ov);
  });

  const keysInCatalog = new Set(auto_groups.map((g) => g.table_group_key));
  for (const row of overridesData ?? []) {
    const r = row as Record<string, unknown>;
    if (!(r.locked as boolean)) continue;
    const key = r.table_group_key as string;
    if (keysInCatalog.has(key)) continue;
    const ids = tableGroupIdsFromKey(key);
    if (ids.length < 2) continue;
    if (!ids.every((id) => tableById.has(id))) continue;
    keysInCatalog.add(key);
    auto_groups.push(catalogAutoGroupFromIds(ids, tableById, r));
  }

  auto_groups.sort((a, b) =>
    a.default_name.localeCompare(b.default_name, undefined, { sensitivity: 'base' }),
  );

  return NextResponse.json({
    combination_threshold: threshold,
    auto_groups,
    overrides: overridesData ?? [],
  });
}
