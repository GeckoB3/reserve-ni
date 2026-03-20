'use client';

import { useCallback, useEffect, useState } from 'react';

interface StaffProfileRow {
  id: string;
  email: string;
  name: string | null;
  phone: string | null;
  role: string;
}

/**
 * Settings for non-admin venue staff: display name, sign-in email, phone, password.
 */
export function StaffPersonalSettingsSection() {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [profile, setProfile] = useState<StaffProfileRow | null>(null);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileSuccess, setProfileSuccess] = useState<string | null>(null);

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch('/api/venue/staff/me');
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? 'Failed to load your profile');
      }
      const { staff: row } = (await res.json()) as { staff: StaffProfileRow };
      setProfile(row);
      setName(row.name ?? '');
      setEmail(row.email);
      setPhone(row.phone ?? '');
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Failed to load profile');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onSaveProfile = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setProfileError(null);
      setProfileSuccess(null);
      setSavingProfile(true);
      try {
        const res = await fetch('/api/venue/staff/me', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: name.trim(),
            email: email.trim().toLowerCase(),
            phone: phone.trim(),
          }),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.error ?? 'Could not save profile');
        }
        const { staff: row } = (await res.json()) as { staff: StaffProfileRow };
        setProfile(row);
        setName(row.name ?? '');
        setEmail(row.email);
        setPhone(row.phone ?? '');
        setProfileSuccess('Profile saved.');
        setTimeout(() => setProfileSuccess(null), 4000);
      } catch (err) {
        setProfileError(err instanceof Error ? err.message : 'Could not save profile');
      } finally {
        setSavingProfile(false);
      }
    },
    [name, email, phone],
  );

  const onChangePassword = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(null);
    if (newPassword.length < 8) {
      setPasswordError('Password must be at least 8 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('Passwords do not match');
      return;
    }
    setChangingPassword(true);
    try {
      const res = await fetch('/api/venue/staff/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ new_password: newPassword }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? 'Password change failed');
      }
      setNewPassword('');
      setConfirmPassword('');
      setPasswordSuccess('Password updated.');
      setTimeout(() => setPasswordSuccess(null), 4000);
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : 'Password change failed');
    } finally {
      setChangingPassword(false);
    }
  }, [newPassword, confirmPassword]);

  if (loading) {
    return (
      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
          <span className="text-sm text-slate-500">Loading your account…</span>
        </div>
      </section>
    );
  }

  if (loadError || !profile) {
    return (
      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm text-red-600">{loadError ?? 'Could not load profile.'}</p>
        <button
          type="button"
          onClick={() => void load()}
          className="mt-3 rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Try again
        </button>
      </section>
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-6 py-4">
          <h2 className="text-base font-semibold text-slate-900">Your profile</h2>
          <p className="mt-0.5 text-sm text-slate-500">
            Update how you appear in the dashboard, your sign-in email, and your contact number.
          </p>
        </div>
        <form onSubmit={onSaveProfile} className="space-y-4 px-6 py-4">
          {profileSuccess && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-700">
              {profileSuccess}
            </div>
          )}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label htmlFor="staff-display-name" className="mb-1 block text-sm font-medium text-slate-700">
                Display name
              </label>
              <input
                id="staff-display-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                maxLength={200}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
              />
            </div>
            <div>
              <label htmlFor="staff-email" className="mb-1 block text-sm font-medium text-slate-700">
                Sign-in email <span className="text-red-400">*</span>
              </label>
              <input
                id="staff-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
              />
              <p className="mt-1 text-xs text-slate-500">Use this address when you log in.</p>
            </div>
            <div>
              <label htmlFor="staff-phone" className="mb-1 block text-sm font-medium text-slate-700">
                Phone
              </label>
              <input
                id="staff-phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Optional"
                maxLength={50}
                autoComplete="tel"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
              />
            </div>
          </div>
          {profileError && <p className="text-sm text-red-600">{profileError}</p>}
          <button
            type="submit"
            disabled={savingProfile}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {savingProfile ? 'Saving…' : 'Save profile'}
          </button>
        </form>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-6 py-4">
          <h2 className="text-base font-semibold text-slate-900">Password</h2>
          <p className="mt-0.5 text-sm text-slate-500">Change the password you use to sign in.</p>
        </div>
        <form onSubmit={onChangePassword} className="max-w-md space-y-3 px-6 py-4">
          {passwordSuccess && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-700">
              {passwordSuccess}
            </div>
          )}
          <div>
            <label htmlFor="staff-new-pw" className="mb-1 block text-sm font-medium text-slate-700">
              New password
            </label>
            <input
              id="staff-new-pw"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              minLength={8}
              autoComplete="new-password"
              placeholder="Min 8 characters"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
            />
          </div>
          <div>
            <label htmlFor="staff-confirm-pw" className="mb-1 block text-sm font-medium text-slate-700">
              Confirm password
            </label>
            <input
              id="staff-confirm-pw"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              minLength={8}
              autoComplete="new-password"
              placeholder="Re-enter password"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
            />
          </div>
          {passwordError && <p className="text-sm text-red-600">{passwordError}</p>}
          <button
            type="submit"
            disabled={changingPassword || !newPassword || !confirmPassword}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {changingPassword ? 'Updating…' : 'Update password'}
          </button>
        </form>
      </section>
    </div>
  );
}
