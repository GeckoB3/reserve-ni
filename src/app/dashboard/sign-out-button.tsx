'use client';

import { createClient } from '@/lib/supabase/browser';
import { useRouter } from 'next/navigation';

export function SignOutButton() {
  const router = useRouter();

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={handleSignOut}
      className="rounded border border-neutral-300 px-3 py-2 text-sm font-medium"
    >
      Sign out
    </button>
  );
}
