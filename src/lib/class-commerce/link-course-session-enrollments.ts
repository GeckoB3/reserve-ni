import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Links an active enrollment to each class instance in the course product (skips already-linked rows).
 */
export async function linkCourseSessionEnrollmentsForEnrollment(
  admin: SupabaseClient,
  params: { enrollmentId: string; sessionInstanceIds: string[] },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { enrollmentId, sessionInstanceIds } = params;
  if (sessionInstanceIds.length === 0) return { ok: true };

  const { data: existing, error: exErr } = await admin
    .from('class_course_session_enrollments')
    .select('class_instance_id')
    .eq('enrollment_id', enrollmentId);

  if (exErr) {
    console.error('[linkCourseSessionEnrollmentsForEnrollment] select', exErr);
    return { ok: false, error: 'Failed to read session links' };
  }

  const have = new Set((existing ?? []).map((r) => (r as { class_instance_id: string }).class_instance_id));
  const missing = [...new Set(sessionInstanceIds)].filter((id) => !have.has(id));
  if (missing.length === 0) return { ok: true };

  const rows = missing.map((class_instance_id) => ({
    enrollment_id: enrollmentId,
    class_instance_id,
    status: 'scheduled' as const,
  }));

  const { error } = await admin.from('class_course_session_enrollments').insert(rows);
  if (error) {
    console.error('[linkCourseSessionEnrollmentsForEnrollment] insert', error);
    return { ok: false, error: 'Failed to link course sessions' };
  }
  return { ok: true };
}
