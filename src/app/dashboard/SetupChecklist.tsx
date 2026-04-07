'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { SetupStatus } from '@/app/api/venue/setup-status/route';
import type { BookingModel } from '@/types/booking-models';
import { isUnifiedSchedulingVenue } from '@/lib/booking/unified-scheduling';

type SetupStepKey = keyof Omit<SetupStatus, 'is_admin' | 'booking_model' | 'enabled_models'>;

interface Step {
  key: SetupStepKey;
  label: string;
  description: string;
  href: string;
  actionLabel: string;
}

function getAvailabilityStep(model: BookingModel): Step {
  switch (model) {
    case 'practitioner_appointment':
    case 'unified_scheduling':
      return {
        key: 'availability_set',
        label: 'Team & services',
        description: 'Review your team members and services, or add new ones.',
        href: '/dashboard/appointment-services',
        actionLabel: 'View services',
      };
    case 'event_ticket':
      return {
        key: 'availability_set',
        label: 'Events',
        description: 'Review your events and ticket types, or create new ones.',
        href: '/dashboard/event-manager',
        actionLabel: 'View events',
      };
    case 'class_session':
      return {
        key: 'availability_set',
        label: 'Classes & timetable',
        description: 'Review your class schedule, or add new classes.',
        href: '/dashboard/class-timetable',
        actionLabel: 'View timetable',
      };
    case 'resource_booking':
      return {
        key: 'availability_set',
        label: 'Resources',
        description: 'Review your bookable resources, or add new ones.',
        href: '/dashboard/resource-timeline',
        actionLabel: 'View resources',
      };
    default:
      return {
        key: 'availability_set',
        label: 'Services & availability',
        description: 'Run the setup wizard to configure your service periods, capacity, and booking rules.',
        href: '/dashboard/onboarding',
        actionLabel: 'Run setup wizard',
      };
  }
}

function isSetupComplete(s: SetupStatus) {
  return (
    s.profile_complete &&
    s.availability_set &&
    s.guest_booking_ready &&
    s.stripe_connected &&
    s.first_booking_made &&
    s.secondary_event_catalog_ready &&
    s.secondary_class_catalog_ready &&
    s.secondary_resource_catalog_ready
  );
}

function getGuestBookingStep(model: BookingModel): Step {
  switch (model) {
    case 'practitioner_appointment':
    case 'unified_scheduling':
      return {
        key: 'guest_booking_ready',
        label: 'Public booking page',
        description:
          'Guests need at least one team member with an active service. Link services under Appointment Services.',
        href: '/dashboard/appointment-services',
        actionLabel: 'Fix services',
      };
    default:
      return {
        key: 'guest_booking_ready',
        label: 'Public booking page',
        description:
          'Add at least one active service and complete availability so online guests can see times and book.',
        href: '/dashboard/onboarding',
        actionLabel: 'Finish setup',
      };
  }
}

function getSecondaryCatalogSteps(enabledModels: BookingModel[]): Step[] {
  const steps: Step[] = [];
  if (enabledModels.includes('event_ticket')) {
    steps.push({
      key: 'secondary_event_catalog_ready',
      label: 'Events (add-on)',
      description: 'Add at least one ticketed event so guests can book it from the Events tab.',
      href: '/dashboard/event-manager',
      actionLabel: 'View events',
    });
  }
  if (enabledModels.includes('class_session')) {
    steps.push({
      key: 'secondary_class_catalog_ready',
      label: 'Classes & timetable (add-on)',
      description: 'Add at least one class type and schedule so guests can book classes.',
      href: '/dashboard/class-timetable',
      actionLabel: 'View timetable',
    });
  }
  if (enabledModels.includes('resource_booking')) {
    steps.push({
      key: 'secondary_resource_catalog_ready',
      label: 'Additional Booking Models',
      description:
        'Enable additional booking options including Appointments, Classes, Events, and Resources.',
      href: '/dashboard/settings?tab=profile#additional-booking-types',
      actionLabel: 'Configure booking types',
    });
  }
  return steps;
}

function getSteps(model: BookingModel, enabledModels: BookingModel[]): Step[] {
  const base: Step[] = [
    {
      key: 'profile_complete',
      label: 'Business profile',
      description: 'Add your business name, address, phone number, and cover photo.',
      href: '/dashboard/settings',
      actionLabel: 'Complete profile',
    },
    getAvailabilityStep(model),
  ];
  if (model === 'table_reservation' || isUnifiedSchedulingVenue(model)) {
    base.push(getGuestBookingStep(model));
  }
  base.push(...getSecondaryCatalogSteps(enabledModels));
  base.push(
    {
      key: 'stripe_connected',
      label: 'Stripe payments',
      description: 'Connect Stripe to collect payments directly into your bank account.',
      href: '/dashboard/settings?tab=payments',
      actionLabel: 'Connect Stripe',
    },
    {
      key: 'first_booking_made',
      label: 'First test booking',
      description: 'Make a test booking to confirm everything is working end-to-end.',
      href: '/dashboard/bookings/new',
      actionLabel: 'Create booking',
    },
  );
  return base;
}

export function SetupChecklist() {
  const [status, setStatus] = useState<SetupStatus | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const key = 'setup_checklist_dismissed';
    const id = requestAnimationFrame(() => {
      if (sessionStorage.getItem(key) === '1') {
        setDismissed(true);
        return;
      }
      fetch('/api/venue/setup-status')
        .then((r) => (r.ok ? r.json() : null))
        .then((data: SetupStatus | null) => {
          if (!data) return;
          if (!data.is_admin) {
            setDismissed(true);
            return;
          }
          setStatus(data);
          if (isSetupComplete(data)) {
            sessionStorage.setItem(key, '1');
            setDismissed(true);
          }
        })
        .catch(() => {});
    });
    return () => cancelAnimationFrame(id);
  }, []);

  const steps = useMemo(
    () => getSteps(status?.booking_model ?? 'table_reservation', status?.enabled_models ?? []),
    [status?.booking_model, status?.enabled_models],
  );

  function dismiss() {
    sessionStorage.setItem('setup_checklist_dismissed', '1');
    setDismissed(true);
  }

  if (dismissed || !status) return null;

  const completedCount = steps.filter((s) => status[s.key]).length;
  const totalCount = steps.length;
  if (completedCount === totalCount) return null;

  const progressPct = Math.round((completedCount / totalCount) * 100);

  return (
    <div className="mb-6 overflow-hidden rounded-xl border border-brand-100 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-4 border-b border-slate-100 px-5 py-4">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-slate-900">
              Get your venue ready - {completedCount}/{totalCount} steps complete
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

      <ul className="divide-y divide-slate-50">
        {steps.map((step) => {
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
