'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { SetupStatus } from '@/app/api/venue/setup-status/route';

interface Step {
  key: keyof SetupStatus;
  label: string;
  description: string;
  href: string;
  actionLabel: string;
}

const STEPS: Step[] = [
  {
    key: 'profile_complete',
    label: 'Venue profile',
    description: 'Add your venue name, address, and phone number.',
    href: '/dashboard/settings',
    actionLabel: 'Complete profile',
  },
  {
    key: 'opening_hours_set',
    label: 'Opening hours',
    description: 'Set the days and times you are open for bookings.',
    href: '/dashboard/settings',
    actionLabel: 'Set opening hours',
  },
  {
    key: 'availability_set',
    label: 'Availability configured',
    description: 'Configure your booking slots or sittings.',
    href: '/dashboard/settings',
    actionLabel: 'Configure availability',
  },
  {
    key: 'stripe_connected',
    label: 'Stripe connected',
    description: 'Connect Stripe to start collecting guest deposits.',
    href: '/dashboard/settings',
    actionLabel: 'Connect Stripe',
  },
  {
    key: 'first_booking_made',
    label: 'First test booking',
    description: 'Make a test booking to confirm everything is working.',
    href: '/dashboard/bookings/new',
    actionLabel: 'Create booking',
  },
];

export function SetupChecklist() {
  const [status, setStatus] = useState<SetupStatus | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const key = 'setup_checklist_dismissed';
    if (sessionStorage.getItem(key) === '1') {
      setDismissed(true);
      return;
    }
    fetch('/api/venue/setup-status')
      .then((r) => r.ok ? r.json() : null)
      .then((data: SetupStatus | null) => {
        if (data) {
          setStatus(data);
          if (isComplete(data)) {
            sessionStorage.setItem(key, '1');
            setDismissed(true);
          }
        }
      })
      .catch(() => {});
  }, []);

  function isComplete(s: SetupStatus) {
    return Object.values(s).every(Boolean);
  }

  function dismiss() {
    sessionStorage.setItem('setup_checklist_dismissed', '1');
    setDismissed(true);
  }

  if (dismissed || !status) return null;

  const completedCount = Object.values(status).filter(Boolean).length;
  const totalCount = STEPS.length;
  const allDone = completedCount === totalCount;
  if (allDone) return null;

  const progressPct = Math.round((completedCount / totalCount) * 100);

  return (
    <div className="mb-6 overflow-hidden rounded-xl border border-brand-100 bg-white shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 border-b border-slate-100 px-5 py-4">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-slate-900">
              Get your venue ready — {completedCount}/{totalCount} steps complete
            </span>
            <span className="rounded-full bg-brand-100 px-2 py-0.5 text-xs font-medium text-brand-700">
              {progressPct}%
            </span>
          </div>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-brand-500 transition-all duration-500"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
        <button
          onClick={dismiss}
          className="flex-shrink-0 rounded p-1 text-slate-400 hover:bg-slate-50 hover:text-slate-600"
          aria-label="Dismiss setup checklist"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Steps */}
      <ul className="divide-y divide-slate-50">
        {STEPS.map((step) => {
          const done = status[step.key];
          return (
            <li key={step.key} className={`flex items-center gap-4 px-5 py-3 ${done ? 'opacity-60' : ''}`}>
              {done ? (
                <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-green-100">
                  <svg className="h-3.5 w-3.5 text-green-600" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                  </svg>
                </div>
              ) : (
                <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border-2 border-slate-200 bg-white">
                  <div className="h-2 w-2 rounded-full bg-slate-300" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium ${done ? 'text-slate-400 line-through' : 'text-slate-800'}`}>
                  {step.label}
                </p>
                {!done && (
                  <p className="text-xs text-slate-500">{step.description}</p>
                )}
              </div>
              {!done && (
                <Link
                  href={step.href}
                  className="flex-shrink-0 rounded-lg border border-brand-200 bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700 hover:bg-brand-100 transition-colors"
                >
                  {step.actionLabel}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
