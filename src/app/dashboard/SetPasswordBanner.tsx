'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/browser';

interface SetPasswordBannerProps {
  onDismiss?: () => void;
}

export function SetPasswordBanner({ onDismiss }: SetPasswordBannerProps) {
  const [showModal, setShowModal] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function handleSetPassword(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    setLoading(true);
    const supabase = createClient();
    const { error: err } = await supabase.auth.updateUser({
      password,
      data: { has_set_password: true },
    });
    setLoading(false);
    if (err) {
      setError(err.message);
      return;
    }
    setDone(true);
    setShowModal(false);
    setPassword('');
    setConfirm('');
  }

  if (done) return null;

  return (
    <>
      <div className="rounded-lg border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-900">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span>Set a password for faster login next time.</span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setShowModal(true)}
              className="rounded bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700"
            >
              Set password
            </button>
            <button
              type="button"
              onClick={() => { onDismiss?.(); }}
              className="rounded border border-brand-300 bg-white px-3 py-1.5 text-sm font-medium text-brand-800 hover:bg-brand-100"
            >
              Maybe later
            </button>
          </div>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div
            className="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold text-neutral-900">Set your password</h2>
            <p className="mt-1 text-sm text-neutral-600">
              You can use it to sign in quickly next time instead of waiting for a magic link.
            </p>
            <form onSubmit={handleSetPassword} className="mt-4 space-y-3">
              <label htmlFor="banner-password" className="block text-sm font-medium text-neutral-700">
                New password
              </label>
              <input
                id="banner-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                autoComplete="new-password"
                className="w-full rounded border border-neutral-300 px-3 py-2 text-sm"
              />
              <label htmlFor="banner-confirm" className="block text-sm font-medium text-neutral-700">
                Confirm password
              </label>
              <input
                id="banner-confirm"
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                minLength={6}
                autoComplete="new-password"
                className="w-full rounded border border-neutral-300 px-3 py-2 text-sm"
              />
              {error && <p className="text-sm text-red-600">{error}</p>}
              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  disabled={loading}
                  className="rounded bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
                >
                  {loading ? 'Saving…' : 'Set password'}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowModal(false); setError(null); }}
                  className="rounded border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
