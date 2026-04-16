'use client';

import { useEffect, useState } from 'react';

const STORAGE_KEY = 'reserveNi_light30UpgradeBannerDismissed';

interface LightUpgradePromoBannerProps {
  /** When true, banner can render (server checks tier, age, etc.). */
  eligible: boolean;
}

/**
 * First 30 days on Appointments Light: highlight upgrade to full Appointments (dismissible).
 */
export function LightUpgradePromoBanner({ eligible }: LightUpgradePromoBannerProps) {
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    if (!eligible) return;
    queueMicrotask(() => {
      try {
        setDismissed(sessionStorage.getItem(STORAGE_KEY) === '1');
      } catch {
        setDismissed(false);
      }
    });
  }, [eligible]);

  if (!eligible || dismissed) {
    return null;
  }

  return (
    <div className="border-b border-brand-200 bg-gradient-to-r from-brand-50 to-amber-50 px-6 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-brand-950">
          <span className="font-semibold">Save by upgrading in your first 30 days.</span>{' '}
          Move to full Appointments for unlimited calendars and team members — billing is prorated when you switch.
        </p>
        <div className="flex flex-shrink-0 items-center gap-2">
          <a
            href="/dashboard/settings?tab=plan"
            className="rounded-lg bg-brand-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-brand-700"
          >
            View plans
          </a>
          <button
            type="button"
            onClick={() => {
              try {
                sessionStorage.setItem(STORAGE_KEY, '1');
              } catch {
                /* ignore */
              }
              setDismissed(true);
            }}
            className="rounded-lg px-2 py-1 text-xs font-medium text-brand-900 hover:bg-white/60"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}
