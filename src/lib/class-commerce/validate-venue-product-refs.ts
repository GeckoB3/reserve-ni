import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Ensures every class type id belongs to the venue (or list is empty/null = all classes).
 */
export async function assertEligibleClassTypesForVenue(
  db: SupabaseClient,
  venueId: string,
  ids: string[] | null | undefined,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (ids == null || ids.length === 0) return { ok: true };
  const unique = [...new Set(ids)];
  const { data, error } = await db.from('class_types').select('id').eq('venue_id', venueId).in('id', unique);
  if (error) {
    console.error('[assertEligibleClassTypesForVenue]', error);
    return { ok: false, error: 'Could not validate class types' };
  }
  const found = new Set((data ?? []).map((r) => (r as { id: string }).id));
  if (found.size !== unique.length) {
    return { ok: false, error: 'One or more class types are invalid for this venue' };
  }
  return { ok: true };
}

/**
 * Ensures every class instance belongs to a class type at this venue.
 */
export async function assertClassInstancesForVenue(
  db: SupabaseClient,
  venueId: string,
  instanceIds: string[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (instanceIds.length === 0) return { ok: true };
  const unique = [...new Set(instanceIds)];
  const { data: instRows, error: instErr } = await db
    .from('class_instances')
    .select('id, class_type_id')
    .in('id', unique);

  if (instErr) {
    console.error('[assertClassInstancesForVenue] instances', instErr);
    return { ok: false, error: 'Could not validate class sessions' };
  }
  const instances = (instRows ?? []) as Array<{ id: string; class_type_id: string }>;
  if (instances.length !== unique.length) {
    return { ok: false, error: 'One or more sessions were not found' };
  }

  const typeIds = [...new Set(instances.map((i) => i.class_type_id))];
  const { data: typeRows, error: typeErr } = await db
    .from('class_types')
    .select('id')
    .eq('venue_id', venueId)
    .in('id', typeIds);

  if (typeErr) {
    console.error('[assertClassInstancesForVenue] class_types', typeErr);
    return { ok: false, error: 'Could not validate class sessions' };
  }
  const validTypes = new Set((typeRows ?? []).map((t) => (t as { id: string }).id));
  for (const i of instances) {
    if (!validTypes.has(i.class_type_id)) {
      return { ok: false, error: 'One or more sessions are invalid or do not belong to this venue' };
    }
  }
  return { ok: true };
}
