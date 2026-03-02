'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/browser';

export function ProfileSection() {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
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
    setSuccess(true);
    setPassword('');
    setConfirm('');
  }

  return (
    <section className="rounded-lg border border-neutral-200 bg-white p-6">
      <h2 className="text-lg font-semibold text-neutral-900">Your account</h2>
      <p className="mt-1 text-sm text-neutral-600">
        Set or change your password. You will stay signed in. Use it to sign in with email and password on the login page.
      </p>
      <form onSubmit={handleSubmit} className="mt-4 max-w-xs space-y-3">
        <label htmlFor="profile-password" className="block text-sm font-medium text-neutral-700">
          New password
        </label>
        <input
          id="profile-password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={6}
          autoComplete="new-password"
          placeholder="••••••••"
          className="w-full rounded border border-neutral-300 px-3 py-2 text-sm"
        />
        <label htmlFor="profile-confirm" className="block text-sm font-medium text-neutral-700">
          Confirm password
        </label>
        <input
          id="profile-confirm"
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          minLength={6}
          autoComplete="new-password"
          placeholder="••••••••"
          className="w-full rounded border border-neutral-300 px-3 py-2 text-sm"
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        {success && <p className="text-sm text-green-600">Password updated.</p>}
        <button
          type="submit"
          disabled={loading || !password || !confirm}
          className="rounded bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
        >
          {loading ? 'Updating…' : 'Set / change password'}
        </button>
      </form>
    </section>
  );
}
