import { NextResponse } from 'next/server';
import { requireImportAdmin } from '@/lib/import/auth';
import { buildImportReportCsv } from '@/lib/import/build-import-report-csv';

/**
 * GET — download CSV report for an import session (import_records + issues + summary).
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const ctx = await requireImportAdmin();
  if ('response' in ctx) return ctx.response;
  const { staff } = ctx;
  const { sessionId } = await params;

  try {
    const csv = await buildImportReportCsv(staff.db, sessionId, staff.venue_id);
    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="import-report-${sessionId.slice(0, 8)}.csv"`,
      },
    });
  } catch (e) {
    console.error('[import report]', e);
    return NextResponse.json({ error: 'Failed to build report' }, { status: 500 });
  }
}
