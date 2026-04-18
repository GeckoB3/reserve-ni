import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Recomputes `has_booking_file` from import_files.
 * - When there is no bookings file: `references_resolved` is set to true.
 * - When `invalidateReferences` is true (e.g. new/relabelled bookings file): `references_resolved` is false.
 * Otherwise `references_resolved` is left unchanged so Step 3b completion is preserved.
 */
export async function syncImportSessionBookingFlags(
  db: SupabaseClient,
  sessionId: string,
  venueId: string,
  opts?: { invalidateReferences?: boolean },
): Promise<void> {
  const { data: files } = await db
    .from('import_files')
    .select('file_type')
    .eq('session_id', sessionId)
    .eq('venue_id', venueId);

  const hasBookingFile = (files ?? []).some((f) => (f as { file_type: string }).file_type === 'bookings');

  const patch: Record<string, unknown> = {
    has_booking_file: hasBookingFile,
    updated_at: new Date().toISOString(),
  };

  if (!hasBookingFile) {
    patch.references_resolved = true;
  } else if (opts?.invalidateReferences) {
    patch.references_resolved = false;
  }

  await db.from('import_sessions').update(patch).eq('id', sessionId).eq('venue_id', venueId);
}
