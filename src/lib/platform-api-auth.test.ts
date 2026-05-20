import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextResponse } from 'next/server';
import type { User } from '@supabase/supabase-js';
import {
  isPlatformAuthFailure,
  requirePlatformSuperuserAuth,
} from '@/lib/platform-api-auth';

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}));

vi.mock('@/lib/platform-auth', () => ({
  isPlatformSuperuser: vi.fn(),
}));

import { createClient } from '@/lib/supabase/server';
import { isPlatformSuperuser } from '@/lib/platform-auth';

function mockUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-1',
    email: 'super@example.com',
    app_metadata: { platform_role: 'superuser' },
    ...overrides,
  } as User;
}

describe('requirePlatformSuperuserAuth', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(createClient).mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: null } }) },
    } as Awaited<ReturnType<typeof createClient>>);

    const result = await requirePlatformSuperuserAuth();
    expect(isPlatformAuthFailure(result)).toBe(true);
    if (isPlatformAuthFailure(result)) {
      expect(result.status).toBe(401);
    }
  });

  it('returns 403 when authenticated but not superuser', async () => {
    vi.mocked(createClient).mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: mockUser() } }) },
    } as Awaited<ReturnType<typeof createClient>>);
    vi.mocked(isPlatformSuperuser).mockReturnValue(false);

    const result = await requirePlatformSuperuserAuth();
    expect(isPlatformAuthFailure(result)).toBe(true);
    if (isPlatformAuthFailure(result)) {
      expect(result.status).toBe(403);
    }
  });

  it('returns user when superuser', async () => {
    const user = mockUser();
    const supabase = {
      auth: { getUser: async () => ({ data: { user } }) },
    } as Awaited<ReturnType<typeof createClient>>;
    vi.mocked(createClient).mockResolvedValue(supabase);
    vi.mocked(isPlatformSuperuser).mockReturnValue(true);

    const result = await requirePlatformSuperuserAuth();
    expect(isPlatformAuthFailure(result)).toBe(false);
    if (!isPlatformAuthFailure(result)) {
      expect(result.user).toBe(user);
      expect(result.supabase).toBe(supabase);
    }
  });
});

describe('isPlatformAuthFailure', () => {
  it('detects NextResponse failures', () => {
    const failure = NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    expect(isPlatformAuthFailure(failure)).toBe(true);
  });
});
