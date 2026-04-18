import { NextRequest, NextResponse } from 'next/server';
import { after } from 'next/server';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { requireImportAdmin } from '@/lib/import/auth';
import { runImportValidation } from '@/lib/import/run-validation';
import { getSupabaseAdminClient } from '@/lib/supabase';

const bodySchema = z.object({
  session_settings: z
    .object({
      ambiguous_date_format: z.enum(['dd/MM/yyyy', 'MM/dd/yyyy']).optional().nullable(),
    })
    .optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const ctx = await requireImportAdmin();
  if ('response' in ctx) return ctx.response;
  const { staff } = ctx;
  const { sessionId } = await params;

  const body = await request.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
  }

  const { data: session } = await staff.db
    .from('import_sessions')
    .select('session_settings, has_booking_file, references_resolved')
    .eq('id', sessionId)
    .eq('venue_id', staff.venue_id)
    .maybeSingle();

  if (!session) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const s = session as {
    session_settings?: Record<string, unknown>;
    has_booking_file?: boolean | null;
    references_resolved?: boolean | null;
  };
  if (s.has_booking_file && s.references_resolved !== true) {
    return NextResponse.json(
      {
        error: 'Booking references are not resolved',
        message:
          'Complete Step 3b (Match Booking References) before validation. Open the References step in the import wizard.',
        code: 'REFERENCES_UNRESOLVED',
      },
      { status: 400 },
    );
  }

  const prev = s.session_settings ?? {};
  const merged = {
    ...prev,
    ...(parsed.data.session_settings ?? {}),
  };

  const jobId = randomUUID();

  await staff.db
    .from('import_sessions')
    .update({
      status: 'validating',
      session_settings: merged,
      validation_job_id: jobId,
      validation_job_status: 'queued',
      validation_job_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', sessionId);

  const venueId = staff.venue_id;

  after(async () => {
    const admin = getSupabaseAdminClient();
    await admin
      .from('import_sessions')
      .update({ validation_job_status: 'running', updated_at: new Date().toISOString() })
      .eq('id', sessionId);
    try {
      await runImportValidation(admin, sessionId, venueId);
    } catch (e) {
      console.error('[validate]', e);
      await admin
        .from('import_sessions')
        .update({
          validation_job_status: 'failed',
          validation_job_error: e instanceof Error ? e.message : 'Validation failed',
          status: 'failed',
          error_message: e instanceof Error ? e.message : 'Validation failed',
          updated_at: new Date().toISOString(),
        })
        .eq('id', sessionId);
    }
  });

  return NextResponse.json({
    ok: true,
    jobId,
    jobStatus: 'queued',
    message: 'Validation queued. Poll GET /api/import/sessions/[sessionId] until validation_job_status is complete.',
  });
}
