'use client';

export interface StaffInviteDraft {
  email: string;
  role: 'admin' | 'staff';
}

interface Props {
  invites: StaffInviteDraft[];
  setInvites: (invites: StaffInviteDraft[]) => void;
  /** Total staff currently in the database (including the owner). */
  existingStaffCount?: number;
  /** Max allowed staff for this plan (null = unlimited). */
  staffLimit?: number | null;
}

export function OnboardingStaffInviteStep({ invites, setInvites, existingStaffCount, staffLimit }: Props) {
  const hasFiniteLimit = typeof staffLimit === 'number' && staffLimit !== Infinity;
  // Slots still available = limit - existing staff - invites already filled in (non-empty)
  const filledInviteCount = invites.filter((i) => i.email.trim() !== '').length;
  const usedSlots = (existingStaffCount ?? 1) + filledInviteCount;
  const remainingSlots = hasFiniteLimit ? Math.max(0, staffLimit! - usedSlots) : Infinity;
  const atLimit = hasFiniteLimit && remainingSlots <= 0;

  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2">
        <h2 className="text-lg font-bold text-slate-900">Invite your team</h2>
        {hasFiniteLimit && (
          <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
            {usedSlots} / {staffLimit} users
          </span>
        )}
      </div>
      <p className="mb-4 text-sm text-slate-500">
        Add any teammates who should be able to sign in alongside you. Each invite gets an email with a link to
        set their password and open the dashboard. You can add or remove users any time from{' '}
        <a href="/dashboard/settings?tab=staff" className="font-medium text-brand-600 underline hover:text-brand-700">
          Settings → Staff
        </a>
        .
      </p>

      {hasFiniteLimit && (
        <div className="mb-4 rounded-xl border border-slate-200 bg-amber-50/60 p-3 text-xs text-slate-600">
          Your Appointments Plus plan includes up to <strong>{staffLimit} team logins</strong> (including your
          own admin account). You&apos;re currently using {existingStaffCount ?? 1}.
        </div>
      )}

      <div className="mb-6 rounded-xl border border-slate-200 bg-slate-50/80 p-4 text-sm text-slate-700">
        <p className="mb-2 font-medium text-slate-800">Two roles to choose from</p>
        <ul className="space-y-1.5 text-slate-600">
          <li>
            <strong className="text-slate-800">Staff</strong>: day-to-day diary work (view, create, edit, and
            cancel bookings; check guests in; take payments where applicable).
          </li>
          <li>
            <strong className="text-slate-800">Admin</strong>: everything staff can do, plus manage settings,
            services, calendars, billing, and invite other users.
          </li>
        </ul>
        <p className="mt-2 text-xs text-slate-500">
          You&apos;re the admin by default. Tip: invite a second admin as a backup so your account isn&apos;t a
          single point of failure.
        </p>
      </div>

      <p className="mb-3 text-xs text-slate-500">
        Don&apos;t have anyone to invite yet? Leave this blank and click <strong>Continue</strong>; you can
        invite people later.
      </p>

      <div className="space-y-3">
        {invites.map((invite, index) => (
          <div key={index} className="rounded-xl border border-slate-200 p-4">
            <div className="mb-3 flex items-start justify-between gap-2">
              <span className="text-xs font-medium uppercase tracking-wide text-slate-400">
                User {index + 1}
              </span>
              {invites.length > 1 && (
                <button
                  type="button"
                  onClick={() => setInvites(invites.filter((_, rowIndex) => rowIndex !== index))}
                  className="text-xs font-medium text-slate-400 hover:text-red-600"
                >
                  Remove
                </button>
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_140px]">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Email</label>
                <input
                  type="email"
                  value={invite.email}
                  onChange={(event) => {
                    const next = [...invites];
                    next[index] = { ...invite, email: event.target.value };
                    setInvites(next);
                  }}
                  placeholder="name@example.com"
                  className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Role</label>
                <select
                  value={invite.role}
                  onChange={(event) => {
                    const next = [...invites];
                    next[index] = {
                      ...invite,
                      role: event.target.value as StaffInviteDraft['role'],
                    };
                    setInvites(next);
                  }}
                  className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none"
                >
                  <option value="staff">Staff</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
            </div>
          </div>
        ))}
      </div>

      {atLimit ? (
        <p className="mt-4 text-center text-xs text-slate-500">
          You&apos;ve reached the {staffLimit}-user limit on your Appointments Plus plan. You can upgrade or
          manage team members from{' '}
          <a href="/dashboard/settings?tab=plan" className="font-medium text-brand-600 underline hover:text-brand-700">
            Settings → Plan
          </a>
          .
        </p>
      ) : (
        <button
          type="button"
          onClick={() => setInvites([...invites, { email: '', role: 'staff' }])}
          className="mt-4 w-full rounded-xl border-2 border-dashed border-slate-200 py-3 text-sm font-medium text-slate-500 transition-colors hover:border-brand-300 hover:text-brand-600"
        >
          + Add another user
        </button>
      )}
    </div>
  );
}
