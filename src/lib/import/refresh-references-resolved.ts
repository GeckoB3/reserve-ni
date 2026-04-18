import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Sets `import_sessions.references_resolved` when every booking reference row is resolved (map/skip/create).
 */
export async function refreshImportReferencesResolved(
  admin: SupabaseClient,
  sessionId: string,
  venueId: string,
): Promise<boolean> {
  const { data: rows } = await admin
    .from('import_booking_references')
    .select('is_resolved')
    .eq('session_id', sessionId)
    .eq('venue_id', venueId);

  if (!rows?.length) {
    const { error } = await admin
      .from('import_sessions')
      .update({ references_resolved: true, updated_at: new Date().toISOString() })
      .eq('id', sessionId)
      .eq('venue_id', venueId);
    if (error) console.error('[refreshReferencesResolved]', error);
    return true;
  }

  const all =
    rows.length > 0 &&
    rows.every((r) => (r as { is_resolved?: boolean }).is_resolved === true);
  const { error } = await admin
    .from('import_sessions')
    .update({ references_resolved: all, updated_at: new Date().toISOString() })
    .eq('id', sessionId)
    .eq('venue_id', venueId);
  if (error) console.error('[refreshReferencesResolved]', error);
  return all;
}
