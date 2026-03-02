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
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'admin' | 'staff'>('staff');
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch('/api/venue/staff');
    if (!res.ok) return;
    const { staff: list } = await res.json();
    setStaff(list ?? []);
  }, []);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  const onInvite = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    const email = inviteEmail.trim().toLowerCase();
    if (!email || !isAdmin) return;
    setInviteError(null);
    setInviting(true);
    try {
      const res = await fetch('/api/venue/staff/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, role: inviteRole }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? 'Invite failed');
      }
      const { staff: newMember } = await res.json();
      setStaff((prev) => [...prev, newMember]);
      setInviteEmail('');
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : 'Invite failed');
    } finally {
      setInviting(false);
    }
  }, [inviteEmail, inviteRole, isAdmin]);

  return (
    <section className="rounded-lg border border-neutral-200 bg-white p-6 shadow-sm">
      <h2 className="mb-4 text-lg font-semibold text-neutral-900">Staff management</h2>
      <p className="mb-4 text-sm text-neutral-600">Admins can edit all settings; staff can only view the dashboard and day sheet.</p>

      {loading ? (
        <p className="text-sm text-neutral-500">Loading…</p>
      ) : (
        <>
          <ul className="mb-6 space-y-2">
            {staff.map((s) => (
              <li key={s.id} className="flex items-center justify-between rounded border border-neutral-100 px-3 py-2">
                <div>
                  <span className="font-medium text-neutral-800">{s.email}</span>
                  {s.name && <span className="ml-2 text-neutral-500">({s.name})</span>}
                  <span className="ml-2 text-xs text-neutral-500 capitalize">({s.role})</span>
                </div>
              </li>
            ))}
          </ul>

          {isAdmin && (
            <form onSubmit={onInvite} className="flex flex-wrap items-end gap-4">
              <div>
                <label htmlFor="invite-email" className="block text-sm font-medium text-neutral-700 mb-1">Invite by email</label>
                <input
                  id="invite-email"
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="colleague@example.com"
                  required
                  className="rounded border border-neutral-300 px-3 py-2 w-64"
                />
              </div>
              <div>
                <label htmlFor="invite-role" className="block text-sm font-medium text-neutral-700 mb-1">Role</label>
                <select id="invite-role" value={inviteRole} onChange={(e) => setInviteRole(e.target.value as 'admin' | 'staff')} className="rounded border border-neutral-300 px-3 py-2">
                  <option value="staff">Staff</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <button type="submit" disabled={inviting} className="rounded bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50">
                {inviting ? 'Sending…' : 'Send invite'}
              </button>
            </form>
          )}

          {inviteError && <p className="mt-2 text-sm text-red-600">{inviteError}</p>}
        </>
      )}
    </section>
  );
}
