import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getVenueStaff } from '@/lib/venue-auth';
import { TABLE_SERVICE_STATUSES } from '@/lib/table-management/constants';
import { clearTableStatusesForBooking } from '@/lib/table-management/lifecycle';
import { z } from 'zod';

const statusUpdateSchema = z.object({
  table_id: z.string().uuid(),
  status: z.enum(TABLE_SERVICE_STATUSES),
  booking_id: z.string().uuid().nullable().optional(),
});

/**
 * GET /api/venue/tables/status — all table statuses for the venue.
 */
export async function GET() {
  const supabase = await createClient();
  const staff = await getVenueStaff(supabase);
  if (!staff) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  const { data, error } = await staff.db
    .from('table_statuses')
    .select('*, table:venue_tables!inner(id, name, venue_id)')
    .eq('table.venue_id', staff.venue_id);

  if (error) {
    console.error('GET /api/venue/tables/status failed:', error);
    return NextResponse.json({ error: 'Failed to load statuses' }, { status: 500 });
  }

  return NextResponse.json({ statuses: data ?? [] });
}

/**
 * PUT /api/venue/tables/status — update a table's status.
 * Logs event to the events table.
 */
export async function PUT(request: NextRequest) {
  const supabase = await createClient();
  const staff = await getVenueStaff(supabase);
  if (!staff) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  const body = await request.json();
  const parsed = statusUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
  }

  const { table_id, status, booking_id } = parsed.data;

  const [{ data: table }, { data: venueSettings }] = await Promise.all([
    staff.db
    .from('venue_tables')
    .select('id, name, venue_id')
    .eq('id', table_id)
    .eq('venue_id', staff.venue_id)
    .single(),
    staff.db
      .from('venues')
      .select('active_table_statuses, auto_bussing_minutes')
      .eq('id', staff.venue_id)
      .single(),
  ]);

  if (!table) {
    return NextResponse.json({ error: 'Table not found' }, { status: 404 });
  }

  const activeStatuses = new Set<string>(venueSettings?.active_table_statuses ?? TABLE_SERVICE_STATUSES);
  if (!activeStatuses.has(status)) {
    return NextResponse.json(
      { error: 'This status is disabled in venue settings' },
      { status: 400 },
    );
  }

  const { data: current } = await staff.db
    .from('table_statuses')
    .select('status, booking_id')
    .eq('table_id', table_id)
    .single();

  const previousStatus = current?.status ?? 'available';

  const { data: updated, error } = await staff.db
    .from('table_statuses')
    .update({
      status,
      booking_id: booking_id ?? (status === 'available' ? null : current?.booking_id),
      updated_at: new Date().toISOString(),
      updated_by: staff.id,
    })
    .eq('table_id', table_id)
    .select('*')
    .single();

  if (error) {
    console.error('Update table status failed:', error);
    return NextResponse.json({ error: 'Failed to update status' }, { status: 500 });
  }

  await staff.db.from('events').insert({
    venue_id: staff.venue_id,
    booking_id: booking_id ?? current?.booking_id ?? null,
    event_type: 'table.status_changed',
    payload: {
      table_id,
      table_name: table.name,
      from_status: previousStatus,
      to_status: status,
      changed_by: staff.id,
    },
  });

  // Keep booking lifecycle in sync for key table status transitions.
  const activeBookingId = booking_id ?? current?.booking_id ?? null;
  if (activeBookingId) {
    if (status === 'seated') {
      await staff.db
        .from('bookings')
        .update({ status: 'Seated', actual_seated_time: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('id', activeBookingId)
        .eq('venue_id', staff.venue_id);
    }

    if (status === 'paid') {
      await staff.db
        .from('bookings')
        .update({ status: 'Completed', actual_departed_time: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('id', activeBookingId)
        .eq('venue_id', staff.venue_id);

      const bussingMinutes = venueSettings?.auto_bussing_minutes ?? 10;
      if (bussingMinutes <= 0) {
        await clearTableStatusesForBooking(staff.db, activeBookingId, staff.id);
      }
    }
  }

  return NextResponse.json({ status: updated });
}
