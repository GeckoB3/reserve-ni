import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Link a venue staff user to a practitioner calendar (Model B), or remove the link.
 * Clears any previous practitioner row pointing at this staff, then optionally assigns the target practitioner.
 */
export async function setStaffPractitionerLink(
  admin: SupabaseClient,
  venueId: string,
  staffMemberId: string,
  practitionerId: string | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error: clearErr } = await admin
    .from('practitioners')
    .update({ staff_id: null })
    .eq('venue_id', venueId)
    .eq('staff_id', staffMemberId);

  if (clearErr) {
    console.error('[setStaffPractitionerLink] clear failed:', clearErr);
    return { ok: false, error: 'Failed to clear previous calendar link' };
  }

  if (!practitionerId) {
    return { ok: true };
  }

  const { data: prac, error: prErr } = await admin
    .from('practitioners')
    .select('id')
    .eq('id', practitionerId)
    .eq('venue_id', venueId)
    .maybeSingle();

  if (prErr || !prac) {
    return { ok: false, error: 'Calendar not found' };
  }

  const { error: upErr } = await admin
    .from('practitioners')
    .update({ staff_id: staffMemberId })
    .eq('id', practitionerId)
    .eq('venue_id', venueId);

  if (upErr) {
    console.error('[setStaffPractitionerLink] assign failed:', upErr);
    return { ok: false, error: 'Failed to link calendar' };
  }

  return { ok: true };
}
