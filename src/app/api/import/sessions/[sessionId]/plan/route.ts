import { NextResponse } from 'next/server';
import { requireImportAdmin } from '@/lib/import/auth';
import {
  buildImportPlanStats,
  fallbackPlanNarrative,
  generatePlanNarrative,
} from '@/lib/import/import-plan';
import { importAiAvailable } from '@/lib/import/openai-client';
import { getSupabaseAdminClient } from '@/lib/supabase';

/**
 * GET /api/import/sessions/[sessionId]/plan — the Stage 5 "Import Plan":
 * deterministic stats about what the import will do plus a plain-English
 * narrative (AI-written; deterministic fallback). Stats are always fresh;
 * the narrative is regenerated whenever the stats change.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const ctx = await requireImportAdmin();
  if ('response' in ctx) return ctx.response;
  const { staff } = ctx;
  const { sessionId } = await params;
  const admin = getSupabaseAdminClient();

  const stats = await buildImportPlanStats(admin, sessionId, staff.venue_id);
  if (!stats) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const statsKey = JSON.stringify(stats);

  const { data: sessRow } = await admin
    .from('import_sessions')
    .select('session_settings')
    .eq('id', sessionId)
    .eq('venue_id', staff.venue_id)
    .single();
  const settings = ((sessRow as { session_settings?: Record<string, unknown> | null } | null)
    ?.session_settings ?? {}) as Record<string, unknown>;
  const cachedPlan = settings.import_plan as
    | { stats_key?: string; headline?: string; narrative?: string; model?: string | null }
    | undefined;

  if (cachedPlan?.stats_key === statsKey && cachedPlan.headline && cachedPlan.narrative) {
    return NextResponse.json({
      stats,
      headline: cachedPlan.headline,
      narrative: cachedPlan.narrative,
      model: cachedPlan.model ?? null,
      from_cache: true,
    });
  }

  const narrative = importAiAvailable()
    ? await generatePlanNarrative(stats)
    : { ...fallbackPlanNarrative(stats), model: null };

  await admin
    .from('import_sessions')
    .update({
      session_settings: {
        ...settings,
        import_plan: {
          stats_key: statsKey,
          headline: narrative.headline,
          narrative: narrative.narrative,
          model: narrative.model,
          generated_at: new Date().toISOString(),
        },
      },
      updated_at: new Date().toISOString(),
    })
    .eq('id', sessionId)
    .eq('venue_id', staff.venue_id);

  return NextResponse.json({
    stats,
    headline: narrative.headline,
    narrative: narrative.narrative,
    model: narrative.model,
    from_cache: false,
  });
}
