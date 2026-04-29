import { describe, it, expect, vi, beforeEach } from 'vitest';
import { consumeClassCreditsForBooking } from '@/lib/class-commerce/consume-class-credits';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Ensures redeem path short-circuits when a redeem ledger row already exists for the booking.
 */
describe('consumeClassCreditsForBooking idempotency', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns ok without mutating when redeem ledger exists', async () => {
    const admin = {
      from: vi.fn((table: string) => {
        if (table === 'class_credit_ledger') {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  limit: () => ({
                    maybeSingle: async () => ({ data: { id: 'led1' }, error: null }),
                  }),
                }),
              }),
            }),
          };
        }
        throw new Error(`unexpected table ${table}`);
      }),
    } as unknown as SupabaseClient;

    const res = await consumeClassCreditsForBooking({
      admin,
      userId: 'u1',
      venueId: 'v1',
      credits: 2,
      bookingId: 'b1',
      idempotencyKey: 'k1',
    });
    expect(res).toEqual({ ok: true });
    expect(admin.from).toHaveBeenCalledTimes(1);
  });
});
