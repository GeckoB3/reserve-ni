import type { SupabaseClient } from '@supabase/supabase-js';

/** True if the user has an active course enrollment that includes this class instance. */
export async function userCourseCoversClassInstance(
  admin: SupabaseClient,
  params: { userId: string; venueId: string; classInstanceId: string },
): Promise<boolean> {
  const { userId, venueId, classInstanceId } = params;

  const { data: links, error: lErr } = await admin
    .from('class_course_session_enrollments')
    .select('enrollment_id')
    .eq('class_instance_id', classInstanceId)
    .in('status', ['scheduled']);

  if (lErr) {
    console.error('[userCourseCoversClassInstance] links', lErr);
    return false;
  }
  const enrollmentIds = [...new Set((links ?? []).map((r) => (r as { enrollment_id: string }).enrollment_id))];
  if (enrollmentIds.length === 0) return false;

  const { data: enrolls, error: eErr } = await admin
    .from('class_course_enrollments')
    .select('id')
    .in('id', enrollmentIds)
    .eq('user_id', userId)
    .eq('venue_id', venueId)
    .eq('status', 'active');

  if (eErr) {
    console.error('[userCourseCoversClassInstance] enrollments', eErr);
    return false;
  }
  return (enrolls ?? []).length > 0;
}
