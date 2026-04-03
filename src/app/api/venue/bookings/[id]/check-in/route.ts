import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getVenueStaff } from '@/lib/venue-auth';

/**
 * POST /api/venue/bookings/[id]/check-in
 * Body: { checked_in?: boolean } - default true. Sets `bookings.checked_in_at` to now, or clears when false.
 * Staff-only. Used for event / class / resource rosters (Sprint 2).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const supabase = await createClient();
    const staff = await getVenueStaff(supabase);
    if (!staff) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

    const { id: bookingId } = await params;
    let checkedIn = true;
    try {
      const body = await request.json();
      if (typeof body?.checked_in === 'boolean') checkedIn = body.checked_in;
    } catch {
      /* empty body ok */
    }

    const { data: row, error: fetchErr } = await staff.db
      .from('bookings')
      .select('id, venue_id')
      .eq('id', bookingId)
      .eq('venue_id', staff.venue_id)
      .maybeSingle();

    if (fetchErr || !row) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
    }

    const now = new Date().toISOString();
    const { error: updErr } = await staff.db
      .from('bookings')
      .update({
        checked_in_at: checkedIn ? now : null,
        updated_at: now,
      })
      .eq('id', bookingId)
      .eq('venue_id', staff.venue_id);

    if (updErr) {
      console.error('check-in update failed:', updErr);
      return NextResponse.json({ error: 'Failed to update check-in' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      booking_id: bookingId,
      checked_in_at: checkedIn ? now : null,
    });
  } catch (err) {
    console.error('POST /api/venue/bookings/[id]/check-in failed:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
