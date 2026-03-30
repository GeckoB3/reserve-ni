export type TableAutoAssignMissReason = 'no_candidate' | 'insert_failed';

export interface TableAutoAssignMissContext {
  venueId: string;
  bookingId: string;
  date: string;
  startTime: string;
  partySize: number;
  durationMinutes: number;
  bufferMinutes: number;
  reason: TableAutoAssignMissReason;
}

/**
 * When `true`, online/widget/booking_page table bookings are rolled back if auto-assign finds no table.
 * Staff and phone flows stay lenient (log + optional UI warning).
 */
export function isStrictTableAssignOnOnlineCreate(): boolean {
  return process.env.REQUIRE_TABLE_ASSIGN_ON_ONLINE_CREATE === 'true';
}

export function logTableAutoAssignMiss(ctx: TableAutoAssignMissContext): void {
  const payload = {
    event: 'table_auto_assign_miss',
    ...ctx,
  };
  console.error(JSON.stringify(payload));
}
