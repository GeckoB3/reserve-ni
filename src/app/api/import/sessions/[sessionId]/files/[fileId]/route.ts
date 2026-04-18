import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireImportAdmin } from '@/lib/import/auth';
import { syncImportSessionBookingFlags } from '@/lib/import/sync-booking-session-flags';

const patchSchema = z.object({
  file_type: z.enum(['clients', 'bookings', 'staff', 'unknown']),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string; fileId: string }> },
) {
  const ctx = await requireImportAdmin();
  if ('response' in ctx) return ctx.response;
  const { staff } = ctx;
  const { sessionId, fileId } = await params;

  const body = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
  }

  const { data: before } = await staff.db
    .from('import_files')
    .select('file_type')
    .eq('id', fileId)
    .eq('session_id', sessionId)
    .eq('venue_id', staff.venue_id)
    .maybeSingle();

  const { error } = await staff.db
    .from('import_files')
    .update({ file_type: parsed.data.file_type })
    .eq('id', fileId)
    .eq('session_id', sessionId)
    .eq('venue_id', staff.venue_id);

  if (error) {
    return NextResponse.json({ error: 'Failed to update file' }, { status: 500 });
  }

  const prevType = (before as { file_type?: string } | null)?.file_type;
  const nextType = parsed.data.file_type;
  const becameBookings = nextType === 'bookings' && prevType !== 'bookings';

  await syncImportSessionBookingFlags(staff.db, sessionId, staff.venue_id, {
    invalidateReferences: becameBookings,
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ sessionId: string; fileId: string }> },
) {
  const ctx = await requireImportAdmin();
  if ('response' in ctx) return ctx.response;
  const { staff } = ctx;
  const { sessionId, fileId } = await params;

  const { data: fileRow } = await staff.db
    .from('import_files')
    .select('storage_path')
    .eq('id', fileId)
    .eq('session_id', sessionId)
    .eq('venue_id', staff.venue_id)
    .maybeSingle();

  if (!fileRow) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  await staff.db.storage.from('imports').remove([(fileRow as { storage_path: string }).storage_path]);

  await staff.db.from('import_files').delete().eq('id', fileId);

  const { data: allFiles } = await staff.db
    .from('import_files')
    .select('row_count')
    .eq('session_id', sessionId);

  const totalRows = (allFiles ?? []).reduce((acc, f) => acc + ((f as { row_count?: number }).row_count ?? 0), 0);

  await staff.db
    .from('import_sessions')
    .update({ total_rows: totalRows, updated_at: new Date().toISOString() })
    .eq('id', sessionId);

  await syncImportSessionBookingFlags(staff.db, sessionId, staff.venue_id);

  return NextResponse.json({ ok: true });
}
