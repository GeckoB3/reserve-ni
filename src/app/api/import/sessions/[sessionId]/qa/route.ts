import { NextResponse } from 'next/server';
import { requireImportAdmin } from '@/lib/import/auth';
import { runImportQaSpotCheck, type QaReport } from '@/lib/import/qa-spot-check';
import { getSupabaseAdminClient } from '@/lib/supabase';

/**
 * POST /api/import/sessions/[sessionId]/qa — post-import QA spot-check.
 * Runs once per completed session (cached in session_settings.qa_report).
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const ctx = await requireImportAdmin();
  if ('response' in ctx) return ctx.response;
  const { staff } = ctx;
  const { sessionId } = await params;
  const admin = getSupabaseAdminClient();

  const { data: session } = await admin
    .from('import_sessions')
    .select('status, session_settings')
    .eq('id', sessionId)
    .eq('venue_id', staff.venue_id)
    .maybeSingle();

  if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const s = session as { status: string; session_settings?: Record<string, unknown> | null };
  if (s.status !== 'complete') {
    return NextResponse.json({ error: 'Import is not complete yet' }, { status: 400 });
  }

  const settings = (s.session_settings ?? {}) as Record<string, unknown>;
  const cached = settings.qa_report as QaReport | undefined;
  if (cached?.generated_at) {
    return NextResponse.json({ report: cached, from_cache: true });
  }

  const report = await runImportQaSpotCheck(admin, sessionId, staff.venue_id);

  await admin
    .from('import_sessions')
    .update({
      session_settings: { ...settings, qa_report: report },
      updated_at: new Date().toISOString(),
    })
    .eq('id', sessionId)
    .eq('venue_id', staff.venue_id);

  return NextResponse.json({ report, from_cache: false });
}
