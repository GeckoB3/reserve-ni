import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireImportAdmin } from '@/lib/import/auth';

const patchSchema = z.object({
  target_field: z.string().nullable().optional(),
  action: z.enum(['map', 'ignore', 'custom', 'split']).optional(),
  custom_field_name: z.string().nullable().optional(),
  custom_field_type: z.enum(['text', 'number', 'date', 'boolean']).nullable().optional(),
  split_config: z.record(z.string(), z.unknown()).nullable().optional(),
  user_overridden: z.boolean().optional(),
});

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string; mappingId: string }> },
) {
  const ctx = await requireImportAdmin();
  if ('response' in ctx) return ctx.response;
  const { staff } = ctx;
  const { sessionId, mappingId } = await params;

  const body = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
  }

  const patch: Record<string, unknown> = { ...parsed.data, updated_at: new Date().toISOString() };

  const { error } = await staff.db
    .from('import_column_mappings')
    .update(patch)
    .eq('id', mappingId)
    .eq('session_id', sessionId);

  if (error) {
    return NextResponse.json({ error: 'Failed to update mapping' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
