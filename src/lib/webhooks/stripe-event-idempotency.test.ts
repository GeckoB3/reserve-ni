import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  claimStripeWebhookEvent,
  releaseStripeWebhookEvent,
} from '@/lib/webhooks/stripe-event-idempotency';

function mockSupabase(handlers: {
  selectResult?: { data: unknown; error: unknown };
  insertError?: { code?: string } | null;
  deleteError?: unknown;
}) {
  return {
    from: vi.fn((table: string) => {
      if (table !== 'webhook_events') throw new Error(`unexpected table ${table}`);
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: handlers.selectResult?.data ?? null,
              error: handlers.selectResult?.error ?? null,
            }),
          }),
        }),
        insert: async () => ({ error: handlers.insertError ?? null }),
        delete: () => ({
          eq: async () => ({ error: handlers.deleteError ?? null }),
        }),
      };
    }),
  } as unknown as SupabaseClient;
}

describe('claimStripeWebhookEvent', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns already_processed when a row exists', async () => {
    const admin = mockSupabase({
      selectResult: { data: { id: 'row-1' }, error: null },
    });

    const result = await claimStripeWebhookEvent(admin, 'evt_1', 'payment_intent.succeeded');
    expect(result).toBe('already_processed');
  });

  it('returns claimed when insert succeeds', async () => {
    const admin = mockSupabase({
      selectResult: { data: null, error: null },
      insertError: null,
    });

    const result = await claimStripeWebhookEvent(admin, 'evt_2', 'payment_intent.succeeded');
    expect(result).toBe('claimed');
  });

  it('returns concurrent on unique violation', async () => {
    const admin = mockSupabase({
      selectResult: { data: null, error: null },
      insertError: { code: '23505' },
    });

    const result = await claimStripeWebhookEvent(admin, 'evt_3', 'payment_intent.succeeded');
    expect(result).toBe('concurrent');
  });

  it('throws on unexpected insert errors', async () => {
    const admin = mockSupabase({
      selectResult: { data: null, error: null },
      insertError: { code: 'XX000' },
    });

    await expect(
      claimStripeWebhookEvent(admin, 'evt_4', 'payment_intent.succeeded'),
    ).rejects.toEqual({ code: 'XX000' });
  });
});

describe('releaseStripeWebhookEvent', () => {
  it('deletes the webhook_events row for the event id', async () => {
    const admin = mockSupabase({});
    await releaseStripeWebhookEvent(admin, 'evt_release');
    expect(admin.from).toHaveBeenCalledWith('webhook_events');
  });
});
