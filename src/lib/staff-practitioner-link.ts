import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Replace all unified calendar assignments for a staff member (any combination of bookable calendars).
 */
export async function setStaffUnifiedCalendarAssignments(
  admin: SupabaseClient,
  venueId: string,
  staffMemberId: string,
  calendarIds: string[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  const unique = [...new Set(calendarIds)];

  if (unique.length === 0) {
    const { error } = await admin
      .from('staff_calendar_assignments')
      .delete()
      .eq('venue_id', venueId)
      .eq('staff_id', staffMemberId);

    if (error) {
      console.error('[setStaffUnifiedCalendarAssignments] clear failed:', error);
      return { ok: false, error: schemaHintFromSupabaseError(error, 'clear') };
    }
    return { ok: true };
  }

  const { data: cals, error: calErr } = await admin
    .from('unified_calendars')
    .select('id, is_active, venue_id, calendar_type')
    .eq('venue_id', venueId)
    .in('id', unique);

  if (calErr) {
    console.error('[setStaffUnifiedCalendarAssignments] calendar lookup failed:', calErr);
    return { ok: false, error: schemaHintFromSupabaseError(calErr, 'validate') };
  }
  if (!cals || cals.length !== unique.length) {
    return { ok: false, error: 'One or more calendars were not found for this venue' };
  }

  if (cals.some((c) => (c as { calendar_type?: string | null }).calendar_type === 'resource')) {
    return {
      ok: false,
      error:
        'Resource calendars (e.g. courts or rooms) cannot be assigned to staff — only people-style bookable columns.',
    };
  }

  if (cals.some((c) => c.is_active === false)) {
    return {
      ok: false,
      error:
        'Inactive calendars cannot be assigned to staff. Activate the calendar first or choose another.',
    };
  }

  const { error: delErr } = await admin
    .from('staff_calendar_assignments')
    .delete()
    .eq('venue_id', venueId)
    .eq('staff_id', staffMemberId);

  if (delErr) {
    console.error('[setStaffUnifiedCalendarAssignments] delete failed:', delErr);
    return { ok: false, error: schemaHintFromSupabaseError(delErr, 'delete') };
  }

  const rows = unique.map((calendarId) => ({
    venue_id: venueId,
    staff_id: staffMemberId,
    calendar_id: calendarId,
  }));

  const { error: insErr } = await admin.from('staff_calendar_assignments').insert(rows);
  if (insErr) {
    console.error('[setStaffUnifiedCalendarAssignments] insert failed:', insErr);
    return { ok: false, error: schemaHintFromSupabaseError(insErr, 'insert') };
  }

  return { ok: true };
}

function schemaHintFromSupabaseError(
  err: { message?: string; code?: string; details?: string | null },
  op: 'clear' | 'delete' | 'insert' | 'validate',
): string {
  const msg = `${err.message ?? ''} ${err.details ?? ''} ${err.code ?? ''}`.toLowerCase();
  const missingRelation =
    (msg.includes('staff_calendar_assignments') &&
      (msg.includes('does not exist') || msg.includes('schema cache') || msg.includes('could not find'))) ||
    err.code === '42P01';
  if (missingRelation) {
    return (
      'Calendar staff assignments are not available in the database yet. Run the latest Supabase migration ' +
      '(file: 20260507120000_staff_calendar_assignments.sql) against your project, then try again.'
    );
  }
  const fallback =
    op === 'validate'
      ? 'Could not verify calendars for this venue.'
      : 'Failed to update calendar assignments.';
  return fallback;
}

/**
 * Link a venue staff user to a bookable calendar, or remove the link.
 * Unified scheduling: junction table `staff_calendar_assignments` (supports multiple calendars per staff).
 * Legacy: `practitioners.staff_id` (at most one).
 */
export async function setStaffPractitionerLink(
  admin: SupabaseClient,
  venueId: string,
  staffMemberId: string,
  practitionerId: string | null,
  options?: { bookingModel?: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  let bookingModel = options?.bookingModel;
  if (bookingModel === undefined) {
    const { data: v } = await admin.from('venues').select('booking_model').eq('id', venueId).maybeSingle();
    bookingModel = ((v as { booking_model?: string } | null)?.booking_model as string) ?? '';
  }

  if (bookingModel === 'unified_scheduling') {
    return setStaffUnifiedCalendarAssignments(
      admin,
      venueId,
      staffMemberId,
      practitionerId ? [practitionerId] : [],
    );
  }

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
