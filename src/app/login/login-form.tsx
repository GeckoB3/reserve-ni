'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/browser';

export function LoginForm({ redirectTo }: { redirectTo?: string }) {
  const [mode, setMode] = useState<'password' | 'magic'>('password');
  const [forgotPassword, setForgotPassword] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const supabase = createClient();
  const callbackUrl = redirectTo
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}/auth/callback?next=${encodeURIComponent(redirectTo)}`
    : `${typeof window !== 'undefined' ? window.location.origin : ''}/auth/callback`;

  async function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error: err } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setLoading(false);
    if (err) {
      setError(err.message);
      return;
    }
    window.location.href = redirectTo ?? '/dashboard';
  }

  async function handleMagicSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);
    setLoading(true);
    const { error: err } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: callbackUrl,
      },
    });
    setLoading(false);
    if (err) {
      setError(err.message);
      return;
    }
    setSent(true);
  }

  async function handleForgotPasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);
    setLoading(true);
    const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: callbackUrl,
    });
    setLoading(false);
    if (err) {
      setError(err.message);
      return;
    }
    setSuccessMessage('Check your inbox for a link to reset your password.');
  }

  if (forgotPassword) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-neutral-600">
          Enter your email and we&apos;ll send you a link to reset your password.
        </p>
        <form onSubmit={handleForgotPasswordSubmit} className="space-y-4">
          <label htmlFor="forgot-email" className="block text-sm font-medium">
            Email
          </label>
          <input
            id="forgot-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            placeholder="you@venue.com"
            className="w-full rounded border border-neutral-300 px-3 py-2 text-sm"
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          {successMessage && <p className="text-sm text-green-600">{successMessage}</p>}
          <div className="flex flex-col gap-2">
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded bg-neutral-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {loading ? 'Sending…' : 'Send reset link'}
            </button>
            <button
              type="button"
              onClick={() => { setForgotPassword(false); setError(null); setSuccessMessage(null); }}
              className="w-full text-sm text-neutral-600 underline hover:text-neutral-900"
            >
              Back to sign in
            </button>
          </div>
        </form>
      </div>
    );
  }

  if (mode === 'password') {
    return (
      <div className="space-y-4">
        <form onSubmit={handlePasswordSubmit} className="space-y-4">
          <label htmlFor="email" className="block text-sm font-medium">
            Email
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            placeholder="you@venue.com"
            className="w-full rounded border border-neutral-300 px-3 py-2 text-sm"
          />
          <label htmlFor="password" className="block text-sm font-medium">
            Password
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
            className="w-full rounded border border-neutral-300 px-3 py-2 text-sm"
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded bg-neutral-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        <div className="flex flex-col gap-1 text-center">
          <button
            type="button"
            onClick={() => setForgotPassword(true)}
            className="text-sm text-neutral-600 underline hover:text-neutral-900"
          >
            Forgot password?
          </button>
          <button
            type="button"
            onClick={() => { setMode('magic'); setError(null); }}
            className="text-sm text-neutral-500 hover:text-neutral-700"
          >
            Sign in with magic link instead
          </button>
        </div>
      </div>
    );
  }

  if (sent) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-neutral-600 text-center">
          Check your inbox for the sign-in link. It may take a minute to arrive.
        </p>
        <button
          type="button"
          onClick={() => { setSent(false); setMode('password'); }}
          className="w-full text-sm text-neutral-600 underline hover:text-neutral-900"
        >
          Sign in with email and password instead
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <form onSubmit={handleMagicSubmit} className="space-y-4">
        <label htmlFor="magic-email" className="block text-sm font-medium">
          Email
        </label>
        <input
          id="magic-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
          placeholder="you@venue.com"
          className="w-full rounded border border-neutral-300 px-3 py-2 text-sm"
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded bg-neutral-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {loading ? 'Sending link…' : 'Send magic link'}
        </button>
      </form>
      <div className="text-center">
        <button
          type="button"
          onClick={() => { setMode('password'); setError(null); }}
          className="text-sm text-neutral-500 hover:text-neutral-700"
        >
          Sign in with email and password instead
        </button>
      </div>
    </div>
  );
}
