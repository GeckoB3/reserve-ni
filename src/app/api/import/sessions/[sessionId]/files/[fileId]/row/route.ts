import { NextRequest, NextResponse } from 'next/server';
import { requireImportAdmin } from '@/lib/import/auth';
import { downloadAndParseCsv } from '@/lib/import/parse-storage-csv';
import { getSupabaseAdminClient } from '@/lib/supabase';

/**
 * GET single parsed CSV row (1-based row number) for validation "View row" previews.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string; fileId: string }> },
) {
  const ctx = await requireImportAdmin();
  if ('response' in ctx) return ctx.response;
  const { staff } = ctx;
  const { sessionId, fileId } = await params;

  const rowParam = request.nextUrl.searchParams.get('row');
  const rowNum = rowParam ? Number.parseInt(rowParam, 10) : NaN;
  if (!Number.isFinite(rowNum) || rowNum < 1) {
    return NextResponse.json({ error: 'Query ?row= is required (1-based positive integer)' }, { status: 400 });
  }

  const { data: file, error: fErr } = await staff.db
    .from('import_files')
    .select('id, session_id, venue_id, filename, storage_path, row_count')
    .eq('id', fileId)
    .eq('session_id', sessionId)
    .eq('venue_id', staff.venue_id)
    .maybeSingle();

  if (fErr || !file) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const rc = (file as { row_count?: number | null }).row_count ?? 0;
  if (rowNum > rc) {
    return NextResponse.json({ error: 'Row number past end of file' }, { status: 400 });
  }

  const admin = getSupabaseAdminClient();
  const parsed = await downloadAndParseCsv(admin, (file as { storage_path: string }).storage_path);
  const row = parsed.rows[rowNum - 1];
  if (!row) {
    return NextResponse.json({ error: 'Row not found' }, { status: 404 });
  }

  return NextResponse.json({
    filename: (file as { filename: string }).filename,
    rowNumber: rowNum,
    totalRows: rc,
    values: row,
    headers: parsed.headers,
  });
}
