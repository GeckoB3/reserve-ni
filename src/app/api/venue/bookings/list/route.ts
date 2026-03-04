import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getVenueStaff } from '@/lib/venue-auth';

/**
 * GET /api/venue/bookings/list?date=YYYY-MM-DD&status=Confirmed|Pending|...
 * Returns bookings for the authenticated venue for the given date, with guest name.
 * Optional status filter. Sorted by time.
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const staff = await getVenueStaff(supabase);
    if (!staff) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    }

    const date = request.nextUrl.searchParams.get('date');
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ error: 'Valid date (YYYY-MM-DD) required' }, { status: 400 });
    }
    const statusFilter = request.nextUrl.searchParams.get('status');

    const { data: rows, error } = await staff.db
      .from('bookings')
      .select('id, booking_date, booking_time, party_size, status, source, deposit_status, deposit_amount_pence, dietary_notes, occasion, guest_id')
      .eq('venue_id', staff.venue_id)
      .eq('booking_date', date)
      .order('booking_time', { ascending: true });

    if (error) {
      console.error('GET /api/venue/bookings/list failed:', error);
      return NextResponse.json({ error: 'Failed to load bookings' }, { status: 500 });
    }

    const guestIds = [...new Set((rows ?? []).map((r: { guest_id: string }) => r.guest_id))];
    const { data: guestsRows } = guestIds.length
      ? await staff.db.from('guests').select('id, name, email, phone').in('id', guestIds)
      : { data: [] };
    const guestsMap = new Map((guestsRows ?? []).map((g: { id: string; name: string | null; email: string | null; phone: string | null }) => [g.id, g]));

    let bookings = (rows ?? []).map((r: Record<string, unknown> & { guest_id: string }) => {
      const guest = guestsMap.get(r.guest_id);
      const { guest_id, ...rest } = r;
      return {
        ...rest,
        guest_name: guest?.name ?? '—',
        guest_email: guest?.email ?? null,
        guest_phone: guest?.phone ?? null,
      };
    });

    if (statusFilter) {
      bookings = bookings.filter((b: Record<string, unknown>) => b.status === statusFilter);
    }

    return NextResponse.json({ bookings });
  } catch (err) {
    console.error('GET /api/venue/bookings/list failed:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
