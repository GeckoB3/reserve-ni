import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { getVenueStaff } from '@/lib/venue-auth';
import { BOOKING_ACTIVE_STATUSES } from '@/lib/table-management/constants';
import { autoAssignTable } from '@/lib/table-availability';
import { syncTableStatusesForBooking } from '@/lib/table-management/lifecycle';
import { resolveTableAssignmentDurationBuffer } from '@/lib/table-management/booking-table-duration';

const bodySchema = z.object({
  dry_run: z.boolean().optional(),
});

function timeToMinutes(value: string): number {
  const [hh, mm] = value.slice(0, 5).split(':').map(Number);
  return (hh ?? 0) * 60 + (mm ?? 0);
}

function getDurationMinutes(bookingTime: string, estimatedEndTime: string | null): number {
  const start = timeToMinutes(bookingTime);
  if (!estimatedEndTime) return 90;
  const timePart = estimatedEndTime.split('T')[1]?.slice(0, 5);
  if (!timePart) return 90;
  const end = timeToMinutes(timePart);
  if (end <= start) return 90;
  return Math.max(15, end - start);
}

type BookingRow = {
  id: string;
  booking_date: string;
  booking_time: string;
  estimated_end_time: string | null;
  party_size: number;
  status: string;
  service_id: string | null;
  guest: { name: string } | { name: string }[] | null;
};

/**
 * POST /api/venue/tables/assignments/bulk-assign
 * Body: { dry_run?: boolean }
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const staff = await getVenueStaff(supabase);
  if (!staff) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
  }

  const dryRun = parsed.data.dry_run ?? false;
  const today = new Date().toISOString().slice(0, 10);

  const { data: rawBookings, error: bookingsError } = await staff.db
    .from('bookings')
    .select('id, booking_date, booking_time, estimated_end_time, party_size, status, guest:guests(name)')
    .eq('venue_id', staff.venue_id)
    .gte('booking_date', today)
    .in('status', [...BOOKING_ACTIVE_STATUSES])
    .order('booking_date', { ascending: true })
    .order('booking_time', { ascending: true });

  if (bookingsError) {
    console.error('Bulk assign list bookings failed:', bookingsError);
    return NextResponse.json({ error: 'Failed to load bookings' }, { status: 500 });
  }

  const bookings = (rawBookings ?? []) as BookingRow[];
  if (bookings.length === 0) {
    return NextResponse.json({
      dry_run: dryRun,
      attempted: 0,
      assigned: 0,
      failed: 0,
      failed_bookings: [],
    });
  }

  const bookingIds = bookings.map((booking) => booking.id);
  const { data: assignmentRows, error: assignmentError } = await staff.db
    .from('booking_table_assignments')
    .select('booking_id')
    .in('booking_id', bookingIds);

  if (assignmentError) {
    console.error('Bulk assign list assignments failed:', assignmentError);
    return NextResponse.json({ error: 'Failed to load assignments' }, { status: 500 });
  }

  const assignedIds = new Set((assignmentRows ?? []).map((row) => row.booking_id));
  const unassignedBookings = bookings.filter((booking) => !assignedIds.has(booking.id));

  if (dryRun) {
    return NextResponse.json({
      dry_run: true,
      attempted: unassignedBookings.length,
      assigned: 0,
      failed: unassignedBookings.length,
      failed_bookings: unassignedBookings.map((booking) => ({
        id: booking.id,
        guest_name: Array.isArray(booking.guest) ? booking.guest[0]?.name ?? 'Guest' : booking.guest?.name ?? 'Guest',
        reason: 'Pending assignment',
      })),
    });
  }

  const failedBookings: Array<{ id: string; guest_name: string; reason: string }> = [];
  let assigned = 0;

  for (const booking of unassignedBookings) {
    const bookingTime = booking.booking_time.slice(0, 5);
    const guestName = Array.isArray(booking.guest) ? booking.guest[0]?.name ?? 'Guest' : booking.guest?.name ?? 'Guest';
    const { durationMinutes, bufferMinutes } = booking.service_id
      ? await resolveTableAssignmentDurationBuffer(
          staff.db,
          staff.venue_id,
          booking.booking_date,
          booking.party_size,
          booking.service_id,
        )
      : {
          durationMinutes: getDurationMinutes(bookingTime, booking.estimated_end_time),
          bufferMinutes: 15,
        };

    try {
      const result = await autoAssignTable(
        staff.db,
        staff.venue_id,
        booking.id,
        booking.booking_date,
        bookingTime,
        durationMinutes,
        bufferMinutes,
        booking.party_size,
      );

      if (!result) {
        failedBookings.push({
          id: booking.id,
          guest_name: guestName,
          reason: 'No available table or combination for this time and party size.',
        });
        continue;
      }

      await syncTableStatusesForBooking(
        staff.db,
        booking.id,
        result.table_ids,
        booking.status,
        staff.id
      );
      assigned += 1;
    } catch (error) {
      console.error('Bulk assign booking failed:', { bookingId: booking.id, error });
      failedBookings.push({
        id: booking.id,
        guest_name: guestName,
        reason: 'Assignment failed due to an internal error.',
      });
    }
  }

  return NextResponse.json({
    dry_run: false,
    attempted: unassignedBookings.length,
    assigned,
    failed: failedBookings.length,
    failed_bookings: failedBookings,
  });
}
