import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireImportAdmin } from '@/lib/import/auth';
import { syncImportSessionBookingFlags } from '@/lib/import/sync-booking-session-flags';

const mappingSchema = z.object({
  id: z.string().uuid().optional(),
  file_id: z.string().uuid(),
  source_column: z.string().min(1),
  target_field: z.string().nullable().optional(),
  action: z.enum(['map', 'ignore', 'custom', 'split']),
  custom_field_name: z.string().nullable().optional(),
  custom_field_type: z.enum(['text', 'number', 'date', 'boolean']).nullable().optional(),
  split_config: z.record(z.string(), z.unknown()).nullable().optional(),
  ai_suggested: z.boolean().optional(),
  ai_confidence: z.string().nullable().optional(),
  ai_reasoning: z.string().nullable().optional(),
  user_overridden: z.boolean().optional(),
  sort_order: z.number().int().optional(),
});

const bodySchema = z.object({
  mappings: z.array(mappingSchema),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const ctx = await requireImportAdmin();
  if ('response' in ctx) return ctx.response;
  const { staff } = ctx;
  const { sessionId } = await params;

  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
  }

  const { data: session } = await staff.db
    .from('import_sessions')
    .select('id')
    .eq('id', sessionId)
    .eq('venue_id', staff.venue_id)
    .maybeSingle();

  if (!session) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  await staff.db.from('import_column_mappings').delete().eq('session_id', sessionId);

  const rows = parsed.data.mappings.map((m, i) => ({
    file_id: m.file_id,
    session_id: sessionId,
    source_column: m.source_column,
    target_field: m.action === 'map' ? m.target_field ?? null : null,
    action: m.action,
    custom_field_name: m.action === 'custom' ? m.custom_field_name ?? null : null,
    custom_field_type: m.action === 'custom' ? m.custom_field_type ?? null : null,
    split_config: m.action === 'split' ? m.split_config ?? null : null,
    ai_suggested: m.ai_suggested ?? false,
    ai_confidence: m.ai_confidence ?? null,
    ai_reasoning: m.ai_reasoning ?? null,
    user_overridden: m.user_overridden ?? true,
    sort_order: m.sort_order ?? i,
  }));

  if (rows.length) {
    const { error } = await staff.db.from('import_column_mappings').insert(rows);
    if (error) {
      console.error('[mappings bulk]', error);
      return NextResponse.json({ error: 'Failed to save mappings' }, { status: 500 });
    }
  }

  await staff.db
    .from('import_sessions')
    .update({ status: 'mapping', updated_at: new Date().toISOString() })
    .eq('id', sessionId);

  const { data: flags } = await staff.db
    .from('import_sessions')
    .select('has_booking_file')
    .eq('id', sessionId)
    .eq('venue_id', staff.venue_id)
    .maybeSingle();

  if ((flags as { has_booking_file?: boolean } | null)?.has_booking_file) {
    await syncImportSessionBookingFlags(staff.db, sessionId, staff.venue_id, {
      invalidateReferences: true,
    });
  }

  return NextResponse.json({ ok: true });
}
