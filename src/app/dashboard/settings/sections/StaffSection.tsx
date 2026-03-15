'use client';

import { useCallback, useEffect, useState } from 'react';
import type { StaffMember } from '../types';

interface StaffSectionProps {
  venueId: string;
  isAdmin: boolean;
}

export function StaffSection({ venueId, isAdmin }: StaffSectionProps) {
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);

  // Create user form
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createEmail, setCreateEmail] = useState('');
  const [createPassword, setCreatePassword] = useState('');
  const [createName, setCreateName] = useState('');
  const [createRole, setCreateRole] = useState<'admin' | 'staff'>('staff');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSuccess, setCreateSuccess] = useState<string | null>(null);

  // Password change (own)
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);

  // Admin reset password for other user
  const [resetTarget, setResetTarget] = useState<StaffMember | null>(null);
  const [resetPassword, setResetPassword] = useState('');
  const [resettingPassword, setResettingPassword] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetSuccess, setResetSuccess] = useState<string | null>(null);

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<StaffMember | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Session timeout
  const [sessionTimeout, setSessionTimeout] = useState<number | null>(null);
  const [sessionTimeoutInput, setSessionTimeoutInput] = useState('');
  const [savingTimeout, setSavingTimeout] = useState(false);
  const [timeoutSaved, setTimeoutSaved] = useState(false);

  // Role editing
  const [editingRole, setEditingRole] = useState<string | null>(null);
  const [roleUpdating, setRoleUpdating] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch('/api/venue/staff');
    if (!res.ok) return;
    const { staff: list } = await res.json();
    setStaff(list ?? []);
  }, []);

  const loadSessionSettings = useCallback(async () => {
    try {
      const res = await fetch('/api/venue/staff/session-settings');
      if (!res.ok) return;
      const data = await res.json();
      setSessionTimeout(data.session_timeout_minutes ?? null);
      setSessionTimeoutInput(data.session_timeout_minutes ? String(data.session_timeout_minutes) : '');
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    setLoading(true);
    Promise.all([load(), loadSessionSettings()]).finally(() => setLoading(false));
  }, [load, loadSessionSettings]);

  // Create user handler
  const onCreateUser = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);
    setCreateSuccess(null);
    const email = createEmail.trim().toLowerCase();
    if (!email || !createPassword) return;
    if (createPassword.length < 8) {
      setCreateError('Password must be at least 8 characters');
      return;
    }
    setCreating(true);
    try {
      const res = await fetch('/api/venue/staff/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: createPassword, name: createName.trim() || undefined, role: createRole }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? 'Failed to create user');
      }
      const { staff: newMember } = await res.json();
      setStaff((prev) => [...prev, newMember]);
      setCreateEmail('');
      setCreatePassword('');
      setCreateName('');
      setCreateRole('staff');
      setCreateSuccess(`User ${email} created successfully`);
      setShowCreateForm(false);
      setTimeout(() => setCreateSuccess(null), 4000);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create user');
    } finally {
      setCreating(false);
    }
  }, [createEmail, createPassword, createName, createRole]);

  // Own password change handler
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
      setPasswordSuccess('Password changed successfully');
      setShowPasswordForm(false);
      setTimeout(() => setPasswordSuccess(null), 4000);
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : 'Password change failed');
    } finally {
      setChangingPassword(false);
    }
  }, [newPassword, confirmPassword]);

  // Admin reset other user's password
  const onResetPassword = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetTarget) return;
    setResetError(null);
    setResetSuccess(null);
    if (resetPassword.length < 8) {
      setResetError('Password must be at least 8 characters');
      return;
    }
    setResettingPassword(true);
    try {
      const res = await fetch(`/api/venue/staff/${resetTarget.id}/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ new_password: resetPassword }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? 'Password reset failed');
      }
      setResetPassword('');
      setResetSuccess(`Password for ${resetTarget.email} has been reset`);
      setResetTarget(null);
      setTimeout(() => setResetSuccess(null), 4000);
    } catch (err) {
      setResetError(err instanceof Error ? err.message : 'Password reset failed');
    } finally {
      setResettingPassword(false);
    }
  }, [resetTarget, resetPassword]);

  // Delete staff handler
  const onDeleteStaff = useCallback(async () => {
    if (!deleteTarget) return;
    setDeleteError(null);
    setDeleting(true);
    try {
      const res = await fetch(`/api/venue/staff/${deleteTarget.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? 'Failed to remove user');
      }
      setStaff((prev) => prev.filter((s) => s.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Failed to remove user');
    } finally {
      setDeleting(false);
    }
  }, [deleteTarget]);

  // Role change handler
  const onRoleChange = useCallback(async (member: StaffMember, newRole: 'admin' | 'staff') => {
    setRoleUpdating(true);
    setEditingRole(null);
    try {
      const res = await fetch(`/api/venue/staff/${member.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? 'Failed to update role');
      }
      setStaff((prev) => prev.map((s) => s.id === member.id ? { ...s, role: newRole } : s));
    } catch (err) {
      console.error('Role update failed:', err);
    } finally {
      setRoleUpdating(false);
    }
  }, []);

  // Session timeout handler
  const onSaveTimeout = useCallback(async () => {
    setSavingTimeout(true);
    setTimeoutSaved(false);
    const val = sessionTimeoutInput.trim();
    const minutes = val === '' ? null : parseInt(val, 10);
    if (val !== '' && (isNaN(minutes!) || minutes! < 0)) return;
    try {
      const res = await fetch('/api/venue/staff/session-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_timeout_minutes: minutes }),
      });
      if (res.ok) {
        setSessionTimeout(minutes);
        setTimeoutSaved(true);
        setTimeout(() => setTimeoutSaved(false), 3000);
      }
    } catch { /* ignore */ }
    finally { setSavingTimeout(false); }
  }, [sessionTimeoutInput]);

  if (loading) {
    return (
      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
          <span className="text-sm text-slate-500">Loading staff settings...</span>
        </div>
      </section>
    );
  }

  return (
    <div className="space-y-6">
      {/* My Account */}
      <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-6 py-4">
          <h2 className="text-base font-semibold text-slate-900">My Account</h2>
          <p className="mt-0.5 text-sm text-slate-500">Manage your own password and account security.</p>
        </div>
        <div className="px-6 py-4 space-y-4">
          {passwordSuccess && (
            <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-2.5 text-sm text-emerald-700">{passwordSuccess}</div>
          )}

          {!showPasswordForm ? (
            <button
              type="button"
              onClick={() => { setShowPasswordForm(true); setPasswordError(null); setPasswordSuccess(null); }}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              <LockIcon className="h-4 w-4 text-slate-400" />
              Change Password
            </button>
          ) : (
            <form onSubmit={onChangePassword} className="max-w-sm space-y-3 rounded-lg border border-slate-200 bg-slate-50/50 p-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">New Password</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Min 8 characters"
                  required
                  minLength={8}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Confirm Password</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter password"
                  required
                  minLength={8}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                />
              </div>
              {passwordError && <p className="text-sm text-red-600">{passwordError}</p>}
              <div className="flex gap-2">
                <button type="submit" disabled={changingPassword} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50">
                  {changingPassword ? 'Updating...' : 'Update Password'}
                </button>
                <button type="button" onClick={() => { setShowPasswordForm(false); setNewPassword(''); setConfirmPassword(''); setPasswordError(null); }} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>
      </section>

      {/* Staff Members */}
      <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Staff Members</h2>
            <p className="mt-0.5 text-sm text-slate-500">
              {isAdmin ? 'Manage team members, roles, and access.' : 'View your team members.'}
            </p>
          </div>
          {isAdmin && (
            <button
              type="button"
              onClick={() => { setShowCreateForm(!showCreateForm); setCreateError(null); setCreateSuccess(null); }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-brand-700"
            >
              <PlusIcon className="h-4 w-4" />
              Add User
            </button>
          )}
        </div>

        <div className="px-6 py-4 space-y-4">
          {createSuccess && (
            <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-2.5 text-sm text-emerald-700">{createSuccess}</div>
          )}
          {resetSuccess && (
            <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-2.5 text-sm text-emerald-700">{resetSuccess}</div>
          )}

          {/* Create User Form */}
          {isAdmin && showCreateForm && (
            <form onSubmit={onCreateUser} className="rounded-lg border border-slate-200 bg-slate-50/50 p-4 space-y-3">
              <h3 className="text-sm font-semibold text-slate-800">Create New User</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Email <span className="text-red-400">*</span></label>
                  <input
                    type="email"
                    value={createEmail}
                    onChange={(e) => setCreateEmail(e.target.value)}
                    placeholder="user@example.com"
                    required
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Name</label>
                  <input
                    type="text"
                    value={createName}
                    onChange={(e) => setCreateName(e.target.value)}
                    placeholder="Full name"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Password <span className="text-red-400">*</span></label>
                  <input
                    type="password"
                    value={createPassword}
                    onChange={(e) => setCreatePassword(e.target.value)}
                    placeholder="Min 8 characters"
                    required
                    minLength={8}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Role <span className="text-red-400">*</span></label>
                  <select
                    value={createRole}
                    onChange={(e) => setCreateRole(e.target.value as 'admin' | 'staff')}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                  >
                    <option value="staff">Staff</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
              </div>
              {createError && <p className="text-sm text-red-600">{createError}</p>}
              <div className="flex gap-2">
                <button type="submit" disabled={creating} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50">
                  {creating ? 'Creating...' : 'Create User'}
                </button>
                <button type="button" onClick={() => { setShowCreateForm(false); setCreateError(null); }} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">
                  Cancel
                </button>
              </div>
            </form>
          )}

          {/* Staff List */}
          <div className="divide-y divide-slate-100 rounded-lg border border-slate-200">
            {staff.map((s) => (
              <div key={s.id} className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-brand-50 text-sm font-semibold text-brand-700">
                    {(s.name ?? s.email).charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-slate-900 truncate">{s.name || s.email}</p>
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                        s.role === 'admin'
                          ? 'bg-purple-50 text-purple-700'
                          : 'bg-slate-100 text-slate-600'
                      }`}>
                        {s.role}
                      </span>
                    </div>
                    {s.name && <p className="text-xs text-slate-500 truncate">{s.email}</p>}
                    <p className="text-[10px] text-slate-400">Joined {new Date(s.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                  </div>
                </div>

                {isAdmin && (
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {/* Role toggle */}
                    {editingRole === s.id ? (
                      <select
                        defaultValue={s.role}
                        onChange={(e) => onRoleChange(s, e.target.value as 'admin' | 'staff')}
                        onBlur={() => setEditingRole(null)}
                        autoFocus
                        disabled={roleUpdating}
                        className="rounded border border-slate-300 px-2 py-1 text-xs focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                      >
                        <option value="staff">Staff</option>
                        <option value="admin">Admin</option>
                      </select>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setEditingRole(s.id)}
                        title="Change role"
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                      >
                        <ShieldIcon className="h-4 w-4" />
                      </button>
                    )}

                    {/* Reset password */}
                    <button
                      type="button"
                      onClick={() => { setResetTarget(s); setResetPassword(''); setResetError(null); setResetSuccess(null); }}
                      title="Reset password"
                      className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                    >
                      <KeyIcon className="h-4 w-4" />
                    </button>

                    {/* Delete */}
                    <button
                      type="button"
                      onClick={() => { setDeleteTarget(s); setDeleteError(null); }}
                      title="Remove user"
                      className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500"
                    >
                      <TrashIcon className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>
            ))}
            {staff.length === 0 && (
              <div className="px-4 py-8 text-center text-sm text-slate-400">No staff members found.</div>
            )}
          </div>

          {/* Permissions Reference */}
          <div className="rounded-lg bg-slate-50 border border-slate-200 px-4 py-3">
            <h4 className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">Role Permissions</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-xs text-slate-500">
              <div><span className="font-medium text-purple-700">Admin:</span> Full access to all settings, staff management, reports, and bookings</div>
              <div><span className="font-medium text-slate-700">Staff:</span> View dashboard, manage bookings and walk-ins, view day sheet</div>
            </div>
          </div>
        </div>
      </section>

      {/* Admin Reset Password Modal */}
      {resetTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm" onClick={() => setResetTarget(null)}>
          <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-lg" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-slate-900 mb-1">Reset Password</h3>
            <p className="text-sm text-slate-500 mb-4">Set a new password for <span className="font-medium text-slate-700">{resetTarget.email}</span></p>
            <form onSubmit={onResetPassword} className="space-y-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">New Password</label>
                <input
                  type="password"
                  value={resetPassword}
                  onChange={(e) => setResetPassword(e.target.value)}
                  placeholder="Min 8 characters"
                  required
                  minLength={8}
                  autoFocus
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                />
              </div>
              {resetError && <p className="text-sm text-red-600">{resetError}</p>}
              <div className="flex gap-2">
                <button type="submit" disabled={resettingPassword} className="flex-1 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50">
                  {resettingPassword ? 'Resetting...' : 'Reset Password'}
                </button>
                <button type="button" onClick={() => setResetTarget(null)} className="flex-1 rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm" onClick={() => setDeleteTarget(null)}>
          <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-lg" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-slate-900 mb-1">Remove Staff Member</h3>
            <p className="text-sm text-slate-500 mb-4">
              Are you sure you want to remove <span className="font-medium text-slate-700">{deleteTarget.name || deleteTarget.email}</span>?
              They will no longer be able to access the dashboard.
            </p>
            {deleteError && <p className="mb-3 text-sm text-red-600">{deleteError}</p>}
            <div className="flex gap-2">
              <button type="button" onClick={onDeleteStaff} disabled={deleting} className="flex-1 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50">
                {deleting ? 'Removing...' : 'Remove'}
              </button>
              <button type="button" onClick={() => setDeleteTarget(null)} className="flex-1 rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Session & Security Settings (Admin only) */}
      {isAdmin && (
        <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-6 py-4">
            <h2 className="text-base font-semibold text-slate-900">Security Settings</h2>
            <p className="mt-0.5 text-sm text-slate-500">Configure session timeouts and security policies for all staff.</p>
          </div>
          <div className="px-6 py-4 space-y-5">
            {/* Session Timeout */}
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Auto-Logout Timer</label>
              <p className="mb-2 text-xs text-slate-500">
                Set how long staff can be inactive before being automatically logged out. Leave empty to keep users logged in until they manually sign out.
              </p>
              <div className="flex items-center gap-3">
                <select
                  value={sessionTimeoutInput}
                  onChange={(e) => setSessionTimeoutInput(e.target.value)}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                >
                  <option value="">No auto-logout</option>
                  <option value="30">30 minutes</option>
                  <option value="60">1 hour</option>
                  <option value="120">2 hours</option>
                  <option value="240">4 hours</option>
                  <option value="480">8 hours</option>
                  <option value="720">12 hours</option>
                  <option value="1440">24 hours</option>
                </select>
                <button
                  type="button"
                  onClick={onSaveTimeout}
                  disabled={savingTimeout}
                  className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
                >
                  {savingTimeout ? 'Saving...' : 'Save'}
                </button>
                {timeoutSaved && <span className="text-sm text-emerald-600">Saved</span>}
              </div>
              {sessionTimeout !== null && sessionTimeout > 0 && (
                <p className="mt-2 text-xs text-slate-500">
                  Current setting: {sessionTimeout >= 60 ? `${Math.floor(sessionTimeout / 60)} hour${sessionTimeout >= 120 ? 's' : ''}` : `${sessionTimeout} minutes`} of inactivity
                </p>
              )}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

function LockIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
    </svg>
  );
}

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
    </svg>
  );
}

function ShieldIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
    </svg>
  );
}

function KeyIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 0 1 3 3m3 0a6 6 0 0 1-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1 1 21.75 8.25Z" />
    </svg>
  );
}

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
    </svg>
  );
}
