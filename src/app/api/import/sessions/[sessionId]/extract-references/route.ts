import { NextResponse } from 'next/server';
import { requireImportAdmin } from '@/lib/import/auth';
import { runExtractBookingReferences } from '@/lib/import/extract-booking-references';
import { getSupabaseAdminClient } from '@/lib/supabase';

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const ctx = await requireImportAdmin();
  if ('response' in ctx) return ctx.response;
  const { staff } = ctx;
  const { sessionId } = await params;

  try {
    const admin = getSupabaseAdminClient();
    const result = await runExtractBookingReferences(admin, sessionId, staff.venue_id);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    console.error('[extract-references]', e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to extract references' },
      { status: 500 },
    );
  }
}
