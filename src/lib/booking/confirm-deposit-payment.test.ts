import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { confirmBookingsForSucceededPaymentIntent } from '@/lib/booking/confirm-deposit-payment';

function mockAdminForConfirm(rows: Array<{ id: string }>) {
  return {
    from: vi.fn((table: string) => {
      if (table !== 'bookings') throw new Error(`unexpected table ${table}`);
      return {
        update: () => ({
          eq: () => ({
            eq: () => ({
              eq: () => ({
                select: async () => ({ data: rows, error: null }),
              }),
            }),
          }),
        }),
      };
    }),
  } as unknown as SupabaseClient;
}

describe('confirmBookingsForSucceededPaymentIntent', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns alreadyConfirmed when no pending rows were updated', async () => {
    const admin = mockAdminForConfirm([]);
    const result = await confirmBookingsForSucceededPaymentIntent(admin, {
      paymentIntentId: 'pi_1',
      venueId: 'venue-1',
    });
    expect(result).toEqual({ ok: true, confirmedIds: [], alreadyConfirmed: true });
  });

  it('returns confirmed ids when pending rows update', async () => {
    const admin = {
      from: vi.fn((table: string) => {
        if (table !== 'bookings') throw new Error(`unexpected table ${table}`);
        let updateCall = 0;
        return {
          update: () => ({
            eq: () => ({
              eq: () => ({
                eq: () => ({
                  select: async () => {
                    updateCall += 1;
                    if (updateCall === 1) return { data: [{ id: 'b1' }], error: null };
                    return { data: null, error: null };
                  },
                }),
              }),
              is: async () => ({ error: null }),
            }),
            in: async () => ({ error: null }),
          }),
        };
      }),
    } as unknown as SupabaseClient;

    const result = await confirmBookingsForSucceededPaymentIntent(admin, {
      paymentIntentId: 'pi_1',
      venueId: 'venue-1',
    });
    expect(result).toEqual({ ok: true, confirmedIds: ['b1'], alreadyConfirmed: false });
  });
});
