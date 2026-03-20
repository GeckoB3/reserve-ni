import type { TableGridData } from '@/types/table-management';
import { BOOKING_ACTIVE_STATUSES } from '@/lib/table-management/constants';

function timeToMinutes(t: string): number {
  const clean = t.slice(0, 5);
  const [h, m] = clean.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

export interface NextBookingsSlotSummary {
  /** Start time HH:MM */
  time: string;
  /** Bookings starting at this time */
  bookingCount: number;
  /** Sum of party sizes */
  totalCovers: number;
}

/** Copy for the amber next-bookings stat tile (table grid, floor plan, day sheet). */
export function nextBookingsTileContent(slot: NextBookingsSlotSummary | null): {
  /** Clock time HH:MM when there is a next slot; `0` when nothing left today. */
  primaryValue: string | number;
  guestsLine: string;
  bookingsLine: string;
} {
  if (slot === null) {
    return {
      primaryValue: 0,
      guestsLine: '0 guests expected',
      bookingsLine: '0 bookings',
    };
  }
  const g = slot.totalCovers;
  const b = slot.bookingCount;
  return {
    primaryValue: slot.time,
    guestsLine: `${g} guest${g === 1 ? '' : 's'} expected`,
    bookingsLine: `${b} booking${b === 1 ? '' : 's'}`,
  };
}

/**
 * Earliest start time on the service day where at least one active booking begins
 * at or after `referenceMinutes`. If several bookings share that start time, returns aggregate counts.
 */
export function computeNextBookingsSlotFromBookingRows(
  bookings: Array<{ id: string; start_time: string; party_size: number; status: string }>,
  referenceMinutes: number,
): NextBookingsSlotSummary | null {
  const active = new Set<string>(BOOKING_ACTIVE_STATUSES as readonly string[]);
  const byId = new Map<string, { startStr: string; startMin: number; party: number }>();

  for (const b of bookings) {
    if (!active.has(b.status)) continue;
    if (byId.has(b.id)) continue;
    const startStr = b.start_time.slice(0, 5);
    byId.set(b.id, {
      startStr,
      startMin: timeToMinutes(startStr),
      party: b.party_size,
    });
  }

  const rows = [...byId.values()];
  const upcoming = rows.filter((r) => r.startMin >= referenceMinutes);
  upcoming.sort((a, b) => a.startMin - b.startMin || a.startStr.localeCompare(b.startStr));
  if (upcoming.length === 0) return null;

  const firstMin = upcoming[0]!.startMin;
  const sameTime = upcoming.filter((r) => r.startMin === firstMin);
  const timeStr = sameTime[0]!.startStr;
  const bookingCount = sameTime.length;
  const totalCovers = sameTime.reduce((s, r) => s + r.party, 0);

  return { time: timeStr, bookingCount, totalCovers };
}

/**
 * Earliest clock time on the grid day where at least one active booking starts,
 * at or after `referenceMinutes`. Includes assigned (from cells) and unassigned.
 * If several bookings share that start time, returns aggregate counts.
 */
export function computeNextBookingsSlot(
  grid: TableGridData,
  referenceMinutes: number,
): NextBookingsSlotSummary | null {
  const rows: Array<{ id: string; start_time: string; party_size: number; status: string }> = [];
  const seen = new Set<string>();

  for (const cell of grid.cells) {
    if (!cell.booking_id || !cell.booking_details) continue;
    if (seen.has(cell.booking_id)) continue;
    seen.add(cell.booking_id);
    const bd = cell.booking_details;
    rows.push({
      id: cell.booking_id,
      start_time: bd.start_time,
      party_size: bd.party_size,
      status: bd.status,
    });
  }

  for (const b of grid.unassigned_bookings) {
    if (seen.has(b.id)) continue;
    seen.add(b.id);
    rows.push({
      id: b.id,
      start_time: b.start_time,
      party_size: b.party_size,
      status: b.status,
    });
  }

  return computeNextBookingsSlotFromBookingRows(rows, referenceMinutes);
}
