import type { SupabaseClient } from '@supabase/supabase-js';
import { BOOKING_ACTIVE_STATUSES, type TableServiceStatus } from '@/lib/table-management/constants';

interface BookingCore {
  id: string;
  venue_id: string;
  booking_date: string;
  booking_time: string;
  estimated_end_time: string | null;
  party_size: number;
  status: string;
}

function timeToMinutes(value: string): number {
  const [hours, minutes] = value.slice(0, 5).split(':').map(Number);
  return (hours ?? 0) * 60 + (minutes ?? 0);
}

function intervalsOverlap(startA: number, endA: number, startB: number, endB: number): boolean {
  return startA < endB && startB < endA;
}

function computeEndMinutes(booking: Pick<BookingCore, 'booking_time' | 'estimated_end_time'>, fallbackMinutes = 90): number {
  const startMin = timeToMinutes(booking.booking_time);
  if (!booking.estimated_end_time) return startMin + fallbackMinutes;
  const raw = booking.estimated_end_time.includes('T')
    ? booking.estimated_end_time.split('T')[1] ?? ''
    : booking.estimated_end_time;
  return raw ? timeToMinutes(raw) : startMin + fallbackMinutes;
}

export async function getBookingById(
  db: SupabaseClient,
  venueId: string,
  bookingId: string,
): Promise<BookingCore | null> {
  const { data } = await db
    .from('bookings')
    .select('id, venue_id, booking_date, booking_time, estimated_end_time, party_size, status')
    .eq('id', bookingId)
    .eq('venue_id', venueId)
    .single();
  return (data as BookingCore | null) ?? null;
}

export async function getAssignedTableIds(db: SupabaseClient, bookingId: string): Promise<string[]> {
  const { data } = await db
    .from('booking_table_assignments')
    .select('table_id')
    .eq('booking_id', bookingId);
  return (data ?? []).map((row: { table_id: string }) => row.table_id);
}

export async function validateTablesBelongToVenue(
  db: SupabaseClient,
  venueId: string,
  tableIds: string[],
): Promise<boolean> {
  if (tableIds.length === 0) return false;
  const { data } = await db
    .from('venue_tables')
    .select('id')
    .eq('venue_id', venueId)
    .in('id', tableIds);
  return (data?.length ?? 0) === tableIds.length;
}

export async function validateTableCapacity(
  db: SupabaseClient,
  tableIds: string[],
  partySize: number,
): Promise<boolean> {
  const { data } = await db
    .from('venue_tables')
    .select('id, max_covers')
    .in('id', tableIds);
  const total = (data ?? []).reduce((sum, row: { max_covers: number }) => sum + row.max_covers, 0);
  return total >= partySize;
}

export async function detectAssignmentConflicts(
  db: SupabaseClient,
  venueId: string,
  booking: BookingCore,
  targetTableIds: string[],
  excludeBookingId?: string,
): Promise<string[]> {
  const { data } = await db
    .from('booking_table_assignments')
    .select('table_id, booking:bookings!inner(id, venue_id, booking_date, booking_time, estimated_end_time, status)')
    .in('table_id', targetTableIds)
    .eq('booking.venue_id', venueId)
    .eq('booking.booking_date', booking.booking_date)
    .in('booking.status', [...BOOKING_ACTIVE_STATUSES]);

  const startMin = timeToMinutes(booking.booking_time);
  const endMin = computeEndMinutes(booking);
  const conflicts = new Set<string>();
  const dayStart = `${booking.booking_date}T00:00:00.000Z`;
  const dayEnd = `${booking.booking_date}T23:59:59.999Z`;

  for (const row of data ?? []) {
    const bookingRaw = row.booking as BookingCore | BookingCore[] | null;
    const linked = Array.isArray(bookingRaw) ? bookingRaw[0] : bookingRaw;
    if (!linked?.id) continue;
    if (excludeBookingId && linked.id === excludeBookingId) continue;
    const otherStart = timeToMinutes(linked.booking_time);
    const otherEnd = computeEndMinutes(linked);
    if (intervalsOverlap(startMin, endMin, otherStart, otherEnd)) {
      conflicts.add(row.table_id);
    }
  }

  const { data: blocks } = await db
    .from('table_blocks')
    .select('table_id, start_at, end_at')
    .in('table_id', targetTableIds)
    .eq('venue_id', venueId)
    .lt('start_at', dayEnd)
    .gt('end_at', dayStart);

  for (const block of blocks ?? []) {
    const blockStart = timeToMinutes(new Date(block.start_at).toISOString().slice(11, 16));
    const blockEnd = timeToMinutes(new Date(block.end_at).toISOString().slice(11, 16));
    if (intervalsOverlap(startMin, endMin, blockStart, blockEnd)) {
      conflicts.add(block.table_id);
    }
  }

  return Array.from(conflicts);
}

export async function replaceBookingAssignments(
  db: SupabaseClient,
  bookingId: string,
  nextTableIds: string[],
  assignedBy: string | null,
): Promise<void> {
  const { error: deleteError } = await db.from('booking_table_assignments').delete().eq('booking_id', bookingId);
  if (deleteError) {
    throw new Error(`Failed to clear existing table assignments: ${deleteError.message}`);
  }

  if (nextTableIds.length === 0) return;

  const { error: insertError } = await db.from('booking_table_assignments').insert(
    nextTableIds.map((tableId) => ({
      booking_id: bookingId,
      table_id: tableId,
      assigned_by: assignedBy,
    })),
  );
  if (insertError) {
    throw new Error(`Failed to write table assignments: ${insertError.message}`);
  }
}

export async function syncTableStatusesForBooking(
  db: SupabaseClient,
  bookingId: string,
  tableIds: string[],
  bookingStatus: string,
  updatedBy: string | null,
): Promise<void> {
  const tableStatus: TableServiceStatus =
    bookingStatus === 'Seated' || bookingStatus === 'Arrived' ? 'seated' : 'reserved';

  if (tableIds.length > 0) {
    await db
      .from('table_statuses')
      .update({
        status: tableStatus,
        booking_id: bookingId,
        updated_by: updatedBy,
        updated_at: new Date().toISOString(),
      })
      .in('table_id', tableIds);
  }
}

export async function clearTableStatusesForBooking(
  db: SupabaseClient,
  bookingId: string,
  updatedBy: string | null,
): Promise<void> {
  await db
    .from('table_statuses')
    .update({
      status: 'available',
      booking_id: null,
      updated_by: updatedBy,
      updated_at: new Date().toISOString(),
    })
    .eq('booking_id', bookingId);
}
