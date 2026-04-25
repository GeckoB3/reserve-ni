'use client';

import Link from 'next/link';
import { planDisplayName } from '@/lib/pricing-constants';
import { isLightPlanTier, isPlusPlanTier } from '@/lib/tier-enforcement';

interface CalendarLimitEntitlement {
  pricing_tier?: string | null;
  calendar_limit?: number | null;
}

interface CalendarLimitMessageProps {
  entitlement: CalendarLimitEntitlement | null | undefined;
  linkClassName?: string;
}

function limitLabel(limit: number): string {
  if (limit === 1) return 'one';
  if (limit === 5) return 'five';
  return String(limit);
}

function bookableCalendarLabel(limit: number): string {
  return `${limitLabel(limit)} bookable calendar${limit === 1 ? '' : 's'}`;
}

export function CalendarLimitMessage({ entitlement, linkClassName }: CalendarLimitMessageProps) {
  const settingsLink = (
    <Link href="/dashboard/settings?tab=plan" className={linkClassName}>
      Settings → Plan
    </Link>
  );

  if (!entitlement) {
    return <>You&apos;ve reached your plan&apos;s calendar limit. Visit {settingsLink} to review your plan.</>;
  }

  const limit = entitlement.calendar_limit;

  if (isLightPlanTier(entitlement.pricing_tier)) {
    return (
      <>
        Appointments Light includes <strong className="font-semibold">one bookable calendar</strong>. Upgrade to
        Appointments Plus or Pro under {settingsLink} to add more columns.
      </>
    );
  }

  if (isPlusPlanTier(entitlement.pricing_tier)) {
    return (
      <>
        Appointments Plus includes <strong className="font-semibold">up to five bookable calendars</strong>. Deactivate
        an existing calendar or upgrade to Appointments Pro under {settingsLink} to add more.
      </>
    );
  }

  if (typeof limit === 'number' && Number.isFinite(limit)) {
    const planName = planDisplayName(entitlement.pricing_tier);
    return (
      <>
        Your {planName} plan includes up to{' '}
        <strong className="font-semibold">{bookableCalendarLabel(limit)}</strong>. Deactivate an existing calendar or
        visit {settingsLink} to adjust your plan.
      </>
    );
  }

  return <>Calendar creation is currently unavailable. Visit {settingsLink} to review your plan.</>;
}
