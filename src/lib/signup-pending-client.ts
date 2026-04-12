'use client';

import type { SignupPendingPlan } from '@/lib/signup-pending-selection';

export function syncPendingToSessionStorage(plan: string | null, businessType: string | null) {
  if (typeof window === 'undefined') return;
  if (plan) sessionStorage.setItem('signup_plan', plan);
  else sessionStorage.removeItem('signup_plan');
  if (businessType) sessionStorage.setItem('signup_business_type', businessType);
  else sessionStorage.removeItem('signup_business_type');
}

export async function fetchPendingSignupSelection(): Promise<{
  plan: SignupPendingPlan | null;
  business_type: string | null;
} | null> {
  const res = await fetch('/api/signup/pending-selection', { credentials: 'same-origin' });
  if (!res.ok) return null;
  return (await res.json()) as { plan: SignupPendingPlan | null; business_type: string | null };
}

export async function persistPendingSignupSelection(plan: SignupPendingPlan, businessType: string | null) {
  await fetch('/api/signup/pending-selection', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ plan, business_type: businessType }),
  });
}
