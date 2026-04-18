import { NextRequest, NextResponse } from 'next/server';
import { requireImportAdmin } from '@/lib/import/auth';
import { CLIENT_FIELDS, BOOKING_FIELDS } from '@/lib/import/constants';
import { runAiColumnMapping } from '@/lib/import/ai-map-columns';

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ sessionId: string; fileId: string }> },
) {
  const ctx = await requireImportAdmin();
  if ('response' in ctx) return ctx.response;
  const { staff } = ctx;
  const { sessionId, fileId } = await params;

  const { data: fileRow } = await staff.db
    .from('import_files')
    .select('*')
    .eq('id', fileId)
    .eq('session_id', sessionId)
    .eq('venue_id', staff.venue_id)
    .maybeSingle();

  if (!fileRow) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const f = fileRow as {
    headers: string[];
    sample_rows: Record<string, string>[];
    file_type: string;
  };

  const ft = f.file_type === 'bookings' ? 'bookings' : 'clients';
  const targetFields = ft === 'bookings' ? BOOKING_FIELDS : CLIENT_FIELDS;

  const { data: session } = await staff.db
    .from('import_sessions')
    .select('detected_platform')
    .eq('id', sessionId)
    .single();

  const detected = (session as { detected_platform?: string | null } | null)?.detected_platform;

  const ai = await runAiColumnMapping({
    headers: f.headers ?? [],
    sampleRows: Array.isArray(f.sample_rows) ? f.sample_rows : [],
    fileType: ft,
    detectedPlatform: detected,
    targetFields,
  });

  const modelUsed = ai?.model ?? null;

  const { error: delErr } = await staff.db.from('import_column_mappings').delete().eq('file_id', fileId);
  if (delErr) {
    console.error('[ai-map] delete mappings', delErr);
  }

  if (!ai?.mappings?.length) {
    await staff.db
      .from('import_sessions')
      .update({ ai_mapping_used: false, ai_model_used: null, updated_at: new Date().toISOString() })
      .eq('id', sessionId);
    return NextResponse.json({ ok: true, mappings: [], message: 'AI mapping unavailable; map columns manually.' });
  }

  let sortOrder = 0;
  const rows = ai.mappings.map((m) => ({
    file_id: fileId,
    session_id: sessionId,
    source_column: m.source_column,
    target_field: m.action === 'map' ? m.target_field : null,
    action: m.action === 'split' ? 'split' : m.action === 'ignore' ? 'ignore' : 'map',
    split_config: m.action === 'split' ? m.split_config ?? null : null,
    ai_suggested: true,
    ai_confidence: m.confidence,
    ai_reasoning: m.reasoning,
    sort_order: sortOrder++,
  }));

  await staff.db.from('import_column_mappings').insert(rows);

  await staff.db
    .from('import_sessions')
    .update({
      ai_mapping_used: true,
      ai_model_used: modelUsed,
      updated_at: new Date().toISOString(),
    })
    .eq('id', sessionId);

  return NextResponse.json({ ok: true, mappings: rows, model: modelUsed });
}
