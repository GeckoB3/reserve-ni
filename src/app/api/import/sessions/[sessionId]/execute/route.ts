import { NextResponse } from 'next/server';
import { requireImportAdmin } from '@/lib/import/auth';
import { runImportExecute } from '@/lib/import/run-execute';

export const maxDuration = 300;

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const ctx = await requireImportAdmin();
  if ('response' in ctx) return ctx.response;
  const { staff } = ctx;
  const { sessionId } = await params;

  const { data: session } = await staff.db
    .from('import_sessions')
    .select('id, status, has_booking_file, references_resolved')
    .eq('id', sessionId)
    .eq('venue_id', staff.venue_id)
    .maybeSingle();

  if (!session) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const sess = session as {
    status: string;
    has_booking_file?: boolean | null;
    references_resolved?: boolean | null;
  };
  if (sess.has_booking_file && sess.references_resolved !== true) {
    return NextResponse.json(
      {
        error: 'Booking references are not resolved',
        message:
          'Complete Step 3b (Match Booking References) before importing. Open the References step in the import wizard.',
        code: 'REFERENCES_UNRESOLVED',
      },
      { status: 400 },
    );
  }

  const st = sess.status;
  if (st === 'complete') {
    return NextResponse.json({ ok: true, alreadyComplete: true });
  }
  if (st === 'importing') {
    return NextResponse.json({ error: 'Import already running' }, { status: 409 });
  }
  if (st !== 'ready') {
    return NextResponse.json(
      { error: 'Run validation first — session must be in "ready" state before import.' },
      { status: 409 },
    );
  }

  try {
    await runImportExecute(staff.db, sessionId, staff.venue_id, staff.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[import execute]', e);
    await staff.db
      .from('import_sessions')
      .update({
        status: 'failed',
        error_message: e instanceof Error ? e.message : 'Import failed',
        updated_at: new Date().toISOString(),
      })
      .eq('id', sessionId);
    return NextResponse.json({ error: 'Import failed' }, { status: 500 });
  }
}
