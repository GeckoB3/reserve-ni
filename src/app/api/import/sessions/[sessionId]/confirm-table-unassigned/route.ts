import { NextResponse } from 'next/server';
import { requireImportAdmin } from '@/lib/import/auth';
import { resolveVenueMode } from '@/lib/venue-mode';
import { getSupabaseAdminClient } from '@/lib/supabase';

/**
 * Restaurant venues: confirms that future booking rows may be imported with default area
 * and without specific table assignment, per product rules.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const ctx = await requireImportAdmin();
  if ('response' in ctx) return ctx.response;
  const { staff } = ctx;
  const { sessionId } = await params;
  const admin = getSupabaseAdminClient();
  const venueMode = await resolveVenueMode(admin, staff.venue_id);

  if (venueMode.bookingModel !== 'table_reservation') {
    return NextResponse.json({ error: 'This action only applies to table reservation venues' }, { status: 400 });
  }

  const { data: session } = await admin
    .from('import_sessions')
    .select('has_booking_file')
    .eq('id', sessionId)
    .eq('venue_id', staff.venue_id)
    .maybeSingle();

  if (!session) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  if (!(session as { has_booking_file?: boolean }).has_booking_file) {
    return NextResponse.json({ error: 'No booking file on this session' }, { status: 400 });
  }

  const { error } = await admin
    .from('import_sessions')
    .update({
      references_resolved: true,
      updated_at: new Date().toISOString(),
    })
    .eq('id', sessionId)
    .eq('venue_id', staff.venue_id);

  if (error) {
    return NextResponse.json({ error: 'Failed to update session' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
