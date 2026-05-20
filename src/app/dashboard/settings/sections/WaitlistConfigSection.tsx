'use client';

import Link from 'next/link';
import type { AppointmentWaitlistMode } from '@/lib/booking/waitlist-config';
import { APPOINTMENT_WAITLIST_MODES, WAITLIST_MODE_LABELS } from '@/lib/booking/waitlist-config';
import type { VenueFeatureFlags } from '@/lib/feature-flags';

export function WaitlistConfigSection({
  enabled,
  mode,
  saving,
  onModeChange,
}: {
  enabled: boolean;
  mode: AppointmentWaitlistMode;
  saving: boolean;
  onModeChange: (mode: AppointmentWaitlistMode) => void;
}) {
  if (!enabled) return null;

  return (
    <div className="mt-3 space-y-3 border-t border-slate-200 pt-3">
      <div className="rounded-lg border border-brand-200/80 bg-brand-50/60 px-3 py-2.5 text-xs leading-relaxed text-slate-700">
        <p className="font-medium text-slate-900">Guest notifications</p>
        <p className="mt-1">
          Waitlist invites are sent by <span className="font-medium">email</span> by default. To
          also send SMS, turn invites off, or edit the message templates, open{' '}
          <Link
            href="/dashboard/settings?tab=comms"
            className="font-semibold text-brand-700 underline decoration-brand-300 underline-offset-2 hover:text-brand-800"
          >
            Settings → Communications
          </Link>{' '}
          and use the <span className="font-medium">Waitlist invites</span> section.
        </p>
      </div>
      <fieldset className="space-y-2">
        <legend className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          When a slot opens
        </legend>
      {APPOINTMENT_WAITLIST_MODES.map((modeKey) => {
        const meta = WAITLIST_MODE_LABELS[modeKey];
        return (
          <label
            key={modeKey}
            className="flex cursor-pointer items-start gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm hover:bg-slate-50"
          >
            <input
              type="radio"
              name="waitlist-mode"
              checked={mode === modeKey}
              disabled={saving}
              onChange={() => onModeChange(modeKey)}
              className="mt-0.5 text-brand-600"
            />
            <span>
              <span className="font-medium text-slate-900">{meta.title}</span>
              <span className="mt-0.5 block text-xs text-slate-600">{meta.description}</span>
            </span>
          </label>
        );
      })}
      </fieldset>
    </div>
  );
}

export function waitlistModeFromFlags(raw: VenueFeatureFlags): AppointmentWaitlistMode {
  const mode = raw.waitlist_config?.mode;
  if (mode === 'staff_choose' || mode === 'notify_in_order' || mode === 'notify_all') {
    return mode;
  }
  return 'notify_in_order';
}
