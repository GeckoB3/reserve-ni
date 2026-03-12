import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getVenueStaff } from '@/lib/venue-auth';
import {
  clearTableStatusesForBooking,
  detectAssignmentConflicts,
  getAssignedTableIds,
  getBookingById,
  replaceBookingAssignments,
  syncTableStatusesForBooking,
  validateTableCapacity,
  validateTablesBelongToVenue,
} from '@/lib/table-management/lifecycle';
import { z } from 'zod';

const assignSchema = z.object({
  booking_id: z.string().uuid(),
  table_ids: z.array(z.string().uuid()).min(1),
});

const reassignSchema = z.object({
  booking_id: z.string().uuid(),
  old_table_ids: z.array(z.string().uuid()),
  new_table_ids: z.array(z.string().uuid()).min(1),
});

const timeChangeSchema = z.object({
  booking_id: z.string().uuid(),
  new_time: z.string().regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$/),
  new_estimated_end_time: z.string().optional(),
});

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const staff = await getVenueStaff(supabase);
  if (!staff) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  const body = await request.json();
  const logAssignmentEvent = async (
    bookingId: string,
    eventType: 'table_assigned' | 'table_reassigned' | 'table_unassigned' | 'booking_time_changed',
    payload: Record<string, unknown>,
  ) => {
    const { error } = await staff.db.from('events').insert({
      venue_id: staff.venue_id,
      booking_id: bookingId,
      event_type: eventType,
      payload,
    });
    if (error) {
      console.error('Assignment event logging failed:', { eventType, bookingId, error: error.message });
    }
  };

  if (body.action === 'reassign') {
    const parsed = reassignSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
    }

    const booking = await getBookingById(staff.db, staff.venue_id, parsed.data.booking_id);
    if (!booking) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
    }

    const tablesValid = await validateTablesBelongToVenue(staff.db, staff.venue_id, parsed.data.new_table_ids);
    if (!tablesValid) {
      return NextResponse.json({ error: 'One or more tables do not belong to this venue' }, { status: 400 });
    }

    const capacityValid = await validateTableCapacity(staff.db, parsed.data.new_table_ids, booking.party_size);
    if (!capacityValid) {
      return NextResponse.json({ error: 'Assigned table(s) do not fit this party size' }, { status: 400 });
    }

    const conflicts = await detectAssignmentConflicts(
      staff.db,
      staff.venue_id,
      booking,
      parsed.data.new_table_ids,
      parsed.data.booking_id,
    );
    if (conflicts.length > 0) {
      return NextResponse.json({ error: 'One or more target tables are already occupied in this time window' }, { status: 409 });
    }

    try {
      await replaceBookingAssignments(staff.db, parsed.data.booking_id, parsed.data.new_table_ids, staff.id);
      await syncTableStatusesForBooking(staff.db, parsed.data.booking_id, parsed.data.new_table_ids, booking.status, staff.id);
      await logAssignmentEvent(parsed.data.booking_id, 'table_reassigned', {
        old_table_ids: parsed.data.old_table_ids,
        new_table_ids: parsed.data.new_table_ids,
      });
    } catch (err) {
      console.error('Reassign failed:', err);
      return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to reassign booking' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  }

  if (body.action === 'change_time') {
    const parsed = timeChangeSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
    }

    const booking = await getBookingById(staff.db, staff.venue_id, parsed.data.booking_id);
    if (!booking) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
    }

    const timeForDb = parsed.data.new_time.length === 5 ? parsed.data.new_time + ':00' : parsed.data.new_time;
    const updates: Record<string, unknown> = {
      booking_time: timeForDb,
      updated_at: new Date().toISOString(),
    };
    if (parsed.data.new_estimated_end_time) {
      updates.estimated_end_time = parsed.data.new_estimated_end_time;
    }

    const assignedTableIds = await getAssignedTableIds(staff.db, parsed.data.booking_id);
    const conflictCandidate = { ...booking, booking_time: timeForDb, estimated_end_time: (parsed.data.new_estimated_end_time ?? booking.estimated_end_time) };
    const conflicts = await detectAssignmentConflicts(
      staff.db,
      staff.venue_id,
      conflictCandidate,
      assignedTableIds,
      parsed.data.booking_id,
    );
    if (conflicts.length > 0) {
      return NextResponse.json({ error: 'Time move conflicts with existing table assignments' }, { status: 409 });
    }

    const { error } = await staff.db
      .from('bookings')
      .update(updates)
      .eq('id', parsed.data.booking_id)
      .eq('venue_id', staff.venue_id);

    if (error) {
      console.error('Change booking time failed:', error);
      return NextResponse.json({ error: 'Failed to change time' }, { status: 500 });
    }

    await syncTableStatusesForBooking(staff.db, parsed.data.booking_id, assignedTableIds, booking.status, staff.id);
    await logAssignmentEvent(parsed.data.booking_id, 'booking_time_changed', {
      new_time: timeForDb,
      new_estimated_end_time: parsed.data.new_estimated_end_time ?? null,
    });

    return NextResponse.json({ success: true });
  }

  if (body.action === 'unassign') {
    const bookingId = body.booking_id;
    if (!bookingId) {
      return NextResponse.json({ error: 'booking_id required' }, { status: 400 });
    }

    const booking = await getBookingById(staff.db, staff.venue_id, bookingId);
    if (!booking) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
    }
    try {
      await replaceBookingAssignments(staff.db, bookingId, [], staff.id);
      await clearTableStatusesForBooking(staff.db, bookingId, staff.id);
      await logAssignmentEvent(bookingId, 'table_unassigned', {});
    } catch (err) {
      console.error('Unassign failed:', err);
      return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to unassign booking' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  }

  const parsed = assignSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
  }

  const booking = await getBookingById(staff.db, staff.venue_id, parsed.data.booking_id);
  if (!booking) {
    return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
  }

  const tablesValid = await validateTablesBelongToVenue(staff.db, staff.venue_id, parsed.data.table_ids);
  if (!tablesValid) {
    return NextResponse.json({ error: 'One or more tables do not belong to this venue' }, { status: 400 });
  }

  const capacityValid = await validateTableCapacity(staff.db, parsed.data.table_ids, booking.party_size);
  if (!capacityValid) {
    return NextResponse.json({ error: 'Assigned table(s) do not fit this party size' }, { status: 400 });
  }

  const conflicts = await detectAssignmentConflicts(
    staff.db,
    staff.venue_id,
    booking,
    parsed.data.table_ids,
    parsed.data.booking_id,
  );
  if (conflicts.length > 0) {
    return NextResponse.json({ error: 'One or more target tables are already occupied in this time window' }, { status: 409 });
  }

  try {
    await replaceBookingAssignments(staff.db, parsed.data.booking_id, parsed.data.table_ids, staff.id);
    await syncTableStatusesForBooking(staff.db, parsed.data.booking_id, parsed.data.table_ids, booking.status, staff.id);
    await logAssignmentEvent(parsed.data.booking_id, 'table_assigned', {
      table_ids: parsed.data.table_ids,
    });
  } catch (err) {
    console.error('Assign failed:', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to assign booking' }, { status: 500 });
  }

  return NextResponse.json({ success: true }, { status: 201 });
}
