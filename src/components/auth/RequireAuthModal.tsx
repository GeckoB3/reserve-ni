'use client';

import { LoginForm } from '@/app/login/login-form';

type RequireAuthModalProps = {
  open: boolean;
  /** Path-only redirect after login (e.g. `/book/foo?tab=classes`). */
  redirectTo: string;
  title?: string;
  onClose?: () => void;
};

/**
 * Inline auth gate: password + magic link (same UX as `/login`).
 * Use when an unauthenticated user attempts a Section 7.3 action from a public page.
 */
export function RequireAuthModal({ open, redirectTo, title = 'Sign in to continue', onClose }: RequireAuthModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div
        className="relative w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="require-auth-title"
      >
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            className="absolute right-4 top-4 rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label="Close"
          >
            ×
          </button>
        ) : null}
        <h2 id="require-auth-title" className="text-lg font-semibold text-slate-900">
          {title}
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          Use your email and password, or request a magic link. After signing in you&apos;ll return to what you were
          doing.
        </p>
        <div className="mt-6">
          <LoginForm redirectTo={redirectTo} />
        </div>
      </div>
    </div>
  );
}
