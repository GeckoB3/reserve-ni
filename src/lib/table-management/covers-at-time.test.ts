import { describe, expect, it } from 'vitest';
import type { TableGridData, TableGridCell } from '@/types/table-management';
import { coversInUseAtTime, tablesInUseAtTime } from './covers-at-time';

function cell(tableId: string, bookingId: string, status = 'Booked'): TableGridCell {
  return {
    table_id: tableId,
    time: '12:00',
    is_available: false,
    booking_id: bookingId,
    booking_details: {
      guest_name: 'Guest',
      party_size: 4,
      status,
      start_time: '12:00',
      end_time: '13:30',
      dietary_notes: null,
      occasion: null,
    },
  };
}

function grid(cells: TableGridCell[]): TableGridData {
  return {
    tables: [],
    cells,
    unassigned_bookings: [],
    summary: {
      total_covers_booked: 0,
      total_covers_capacity: 0,
      tables_in_use: 0,
      tables_total: 0,
      unassigned_count: 0,
    },
  };
}

describe('table usage at time', () => {
  it('counts covers once per booking and tables once per occupied table', () => {
    const data = grid([cell('table-1', 'booking-1'), cell('table-2', 'booking-1')]);

    expect(coversInUseAtTime(data, 12 * 60 + 30)).toBe(4);
    expect(tablesInUseAtTime(data, 12 * 60 + 30)).toBe(2);
  });

  it('does not count tables for bookings outside the current time', () => {
    const data = grid([cell('table-1', 'booking-1')]);

    expect(tablesInUseAtTime(data, 11 * 60)).toBe(0);
  });

  it('ignores cancelled bookings', () => {
    const data = grid([cell('table-1', 'booking-1', 'Cancelled')]);

    expect(tablesInUseAtTime(data, 12 * 60 + 30)).toBe(0);
  });
});
