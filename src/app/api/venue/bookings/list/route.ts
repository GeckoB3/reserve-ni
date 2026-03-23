import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getVenueStaff } from '@/lib/venue-auth';

/**
 * GET /api/venue/bookings/list?date=YYYY-MM-DD&status=Confirmed|Pending|...
 * or  /api/venue/bookings/list?from=YYYY-MM-DD&to=YYYY-MM-DD&status=...
 * Returns bookings for the authenticated venue, with guest name.
 * Sorted by date then time.
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const staff = await getVenueStaff(supabase);
    if (!staff) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    }

    const date = request.nextUrl.searchParams.get('date');
    const from = request.nextUrl.searchParams.get('from');
    const to = request.nextUrl.searchParams.get('to');
    const ids = request.nextUrl.searchParams.get('ids');
    const statusFilter = request.nextUrl.searchParams.get('status');
    const isoRe = /^\d{4}-\d{2}-\d{2}$/;

    let query = staff.db
      .from('bookings')
      .select('id, booking_date, booking_time, party_size, status, source, deposit_status, deposit_amount_pence, dietary_notes, occasion, estimated_end_time, created_at, guest_id')
      .eq('venue_id', staff.venue_id)
      .order('booking_date', { ascending: true })
      .order('booking_time', { ascending: true });

    if (ids) {
      const idList = ids.split(',').filter(Boolean);
      if (idList.length === 0) {
        return NextResponse.json({ bookings: [] });
      }
      query = query.in('id', idList);
    } else if (date && isoRe.test(date)) {
      query = query.eq('booking_date', date);
    } else if (from && to && isoRe.test(from) && isoRe.test(to)) {
      query = query.gte('booking_date', from).lte('booking_date', to);
    } else {
      return NextResponse.json({ error: 'Provide date=YYYY-MM-DD or from=...&to=... or ids=...' }, { status: 400 });
    }

    const { data: rows, error } = await query;

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
      return {
        id: r.id,
        booking_date: r.booking_date,
        booking_time: r.booking_time,
        party_size: r.party_size,
        status: r.status,
        source: r.source,
        deposit_status: r.deposit_status,
        deposit_amount_pence: r.deposit_amount_pence,
        dietary_notes: r.dietary_notes,
        occasion: r.occasion,
        estimated_end_time: r.estimated_end_time,
        created_at: r.created_at,
        guest_name: guest?.name ?? '—',
        guest_email: guest?.email ?? null,
        guest_phone: guest?.phone ?? null,
      };
    });

    if (statusFilter) {
      bookings = bookings.filter((b: Record<string, unknown>) => b.status === statusFilter);
    }

    // Attach table assignments
    const bookingIds = bookings.map((b: Record<string, unknown>) => b.id as string);
    const assignmentsMap = new Map<string, Array<{ id: string; name: string }>>();
    if (bookingIds.length > 0) {
      const { data: assignRows } = await staff.db
        .from('booking_table_assignments')
        .select('booking_id, table_id, table:venue_tables(id, name)')
        .in('booking_id', bookingIds);
      for (const row of assignRows ?? []) {
        const r = row as unknown as { booking_id: string; table_id: string; table: Array<{ id: string; name: string }> | { id: string; name: string } | null };
        const tableObj = Array.isArray(r.table) ? r.table[0] : r.table;
        const existing = assignmentsMap.get(r.booking_id) ?? [];
        existing.push({ id: tableObj?.id ?? r.table_id, name: tableObj?.name ?? 'Unknown' });
        assignmentsMap.set(r.booking_id, existing);
      }
    }

    const enriched = bookings.map((b: Record<string, unknown>) => ({
      ...b,
      table_assignments: assignmentsMap.get(b.id as string) ?? [],
    }));

    return NextResponse.json({ bookings: enriched });
  } catch (err) {
    console.error('GET /api/venue/bookings/list failed:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
