import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireImportAdmin } from '@/lib/import/auth';
import { CLIENT_FIELDS, BOOKING_FIELDS } from '@/lib/import/constants';
import { runAiColumnMapping } from '@/lib/import/ai-map-columns';

const bodySchema = z.object({
  fileId: z.string().uuid(),
  headers: z.array(z.string()),
  sampleRows: z.array(z.record(z.string(), z.string())),
  fileType: z.enum(['clients', 'bookings']),
  detectedPlatform: z.string().optional().nullable(),
});

export async function POST(request: NextRequest) {
  const ctx = await requireImportAdmin();
  if ('response' in ctx) return ctx.response;
  const { staff } = ctx;

  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
  }

  const { fileId, headers, sampleRows, fileType, detectedPlatform } = parsed.data;

  const { data: fileRow } = await staff.db
    .from('import_files')
    .select('id, venue_id, session_id')
    .eq('id', fileId)
    .eq('venue_id', staff.venue_id)
    .maybeSingle();

  if (!fileRow) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const targetFields = fileType === 'bookings' ? BOOKING_FIELDS : CLIENT_FIELDS;

  const ai = await runAiColumnMapping({
    headers,
    sampleRows,
    fileType,
    detectedPlatform: detectedPlatform ?? undefined,
    targetFields,
  });

  if (!ai) {
    return NextResponse.json({ mappings: [], model: null });
  }

  return NextResponse.json({ mappings: ai.mappings, model: ai.model });
}
