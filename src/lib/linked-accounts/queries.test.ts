import { describe, it, expect } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getAcceptedLinkBetween } from './queries';

/** Minimal chainable admin stub whose `maybeSingle()` resolves the given result. */
function adminReturning(result: { data: unknown; error: unknown }): SupabaseClient {
  const chain = {
    select: () => chain,
    eq: () => chain,
    maybeSingle: async () => result,
  };
  return { from: () => chain } as unknown as SupabaseClient;
}

describe('getAcceptedLinkBetween', () => {
  // Regression: a transient read error must NOT be swallowed as a null ("no link"),
  // because reconcileCollective takes an irreversible action (dissolve) on a null result.
  it('throws on a real read error instead of returning null', async () => {
    const admin = adminReturning({ data: null, error: { message: 'boom' } });
    await expect(getAcceptedLinkBetween(admin, 'a', 'b')).rejects.toThrow('boom');
  });

  it('returns null when there is genuinely no link (no error)', async () => {
    const admin = adminReturning({ data: null, error: null });
    await expect(getAcceptedLinkBetween(admin, 'a', 'b')).resolves.toBeNull();
  });
});
