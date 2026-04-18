import { NextResponse } from 'next/server';
import { requireImportAdmin } from '@/lib/import/auth';

export async function GET() {
  const ctx = await requireImportAdmin();
  if ('response' in ctx) return ctx.response;
  const { staff } = ctx;

  const { data, error } = await staff.db
    .from('import_sessions')
    .select(
      'id, status, detected_platform, total_rows, imported_clients, imported_bookings, skipped_rows, updated_existing, undo_available_until, undone_at, created_at, completed_at, ai_mapping_used',
    )
    .eq('venue_id', staff.venue_id)
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) {
    console.error('[import sessions GET]', error);
    return NextResponse.json({ error: 'Failed to list sessions' }, { status: 500 });
  }

  return NextResponse.json({ sessions: data ?? [] });
}

export async function POST() {
  const ctx = await requireImportAdmin();
  if ('response' in ctx) return ctx.response;
  const { staff } = ctx;

  const { data, error } = await staff.db
    .from('import_sessions')
    .insert({
      venue_id: staff.venue_id,
      created_by: staff.id,
      status: 'uploading',
    })
    .select('id, status, created_at')
    .single();

  if (error || !data) {
    console.error('[import sessions POST]', error);
    return NextResponse.json({ error: 'Failed to create session' }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
