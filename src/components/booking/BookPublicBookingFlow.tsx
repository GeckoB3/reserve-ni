'use client';

import { useCallback, useEffect, useMemo, useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { BookingModel } from '@/types/booking-models';
import {
  publicBookTabsForVenue,
  resolvePublicBookTabFromQuery,
  type PublicBookTabSlug,
} from '@/lib/booking/public-book-tabs';
import { BookingFlowRouter, type LockedPractitionerBooking } from '@/components/booking/BookingFlowRouter';
import type { VenuePublic } from '@/components/booking/types';

const EMPTY_ENABLED: BookingModel[] = [];

const CANCELLATION_POLICY =
  'Full refund if cancelled 48+ hours before your reservation. No refund within 48 hours or for no-shows.';

interface Props {
  venue: VenuePublic;
  lockedPractitioner?: LockedPractitionerBooking | null;
  embed?: boolean;
  onHeightChange?: (height: number) => void;
  accentColour?: string;
}

export function BookPublicBookingFlow({
  venue,
  lockedPractitioner,
  embed,
  onHeightChange,
  accentColour,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [tabPending, startTabTransition] = useTransition();
  const primary = (venue.booking_model as BookingModel) ?? 'table_reservation';
  const enabled = venue.enabled_models ?? [];

  const tabs = useMemo(
    () => publicBookTabsForVenue(primary, enabled, venue.terminology),
    [primary, enabled, venue.terminology],
  );

  const tabParam = searchParams.get('tab');
  const activeSlug = useMemo(
    () => resolvePublicBookTabFromQuery(tabParam, primary, enabled, venue.terminology),
    [tabParam, primary, enabled, venue.terminology],
  );

  const activeModel = useMemo(() => {
    const found = tabs.find((t) => t.slug === activeSlug);
    return found?.bookingModel ?? primary;
  }, [tabs, activeSlug, primary]);

  const replaceTabInUrl = useCallback(
    (slug: PublicBookTabSlug) => {
      startTabTransition(() => {
        const next = new URLSearchParams(searchParams.toString());
        next.set('tab', slug);
        router.replace(`${pathname}?${next.toString()}`, { scroll: false });
      });
    },
    [pathname, router, searchParams],
  );

  useEffect(() => {
    if (tabs.length <= 1) return;
    const resolved = resolvePublicBookTabFromQuery(tabParam, primary, enabled, venue.terminology);
    if (tabParam === resolved) return;
    const next = new URLSearchParams(searchParams.toString());
    next.set('tab', resolved);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    // Intentionally omit `searchParams` object identity — use tabParam + pathname only.
  }, [tabs.length, tabParam, primary, enabled, venue.terminology, pathname, router]);

  return (
    <div className="space-y-6">
      {tabs.length > 1 && (
        <div
          className="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-2"
          aria-busy={tabPending}
        >
          {tabs.map((t) => {
            const isActive = t.slug === activeSlug;
            return (
              <button
                key={t.slug}
                type="button"
                onClick={() => replaceTabInUrl(t.slug)}
                className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-brand-600 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {t.label}
              </button>
            );
          })}
          {tabPending ? (
            <span className="text-xs text-slate-500" aria-live="polite">
              Switching…
            </span>
          ) : null}
        </div>
      )}

      <BookingFlowRouter
        key={activeSlug}
        venue={venue}
        activeBookingModel={activeModel}
        cancellationPolicy={CANCELLATION_POLICY}
        lockedPractitioner={lockedPractitioner ?? undefined}
        embed={embed}
        onHeightChange={onHeightChange}
        accentColour={accentColour}
      />
    </div>
  );
}
