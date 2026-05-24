import { describe, expect, it } from 'vitest';
import { bookingStatusVisualForRow, bookingStatusVisualKeyForRow } from './booking-status-visual';

describe('booking status visual rows', () => {
  it('uses Arrived visual key while a waiting booking has arrived', () => {
    const row = {
      status: 'Confirmed',
      client_arrived_at: '2026-06-01T18:00:00.000Z',
    };

    expect(bookingStatusVisualKeyForRow(row)).toBe('Arrived');
    expect(bookingStatusVisualForRow(row).listBorderLeft).toBe('border-l-[#D97706]');
  });

  it('keeps lifecycle visual keys once the booking has started or finished', () => {
    expect(
      bookingStatusVisualKeyForRow({
        status: 'Seated',
        client_arrived_at: '2026-06-01T18:00:00.000Z',
      }),
    ).toBe('Seated');
    expect(
      bookingStatusVisualKeyForRow({
        status: 'Completed',
        client_arrived_at: '2026-06-01T18:00:00.000Z',
      }),
    ).toBe('Completed');
  });
});
