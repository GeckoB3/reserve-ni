'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { StaffBookingSurfaceTabsBar } from '@/components/booking/StaffBookingSurfaceTabsBar';
import { UnifiedBookingForm } from '@/components/booking/UnifiedBookingForm';
import { AppointmentWalkInModal } from '@/components/booking/AppointmentWalkInModal';
import { AppointmentBookingFlow } from '@/components/booking/AppointmentBookingFlow';
import { EventBookingFlow } from '@/components/booking/EventBookingFlow';
import { ClassBookingFlow } from '@/components/booking/ClassBookingFlow';
import { ResourceBookingFlow } from '@/components/booking/ResourceBookingFlow';
import type { VenuePublic } from '@/components/booking/types';
import { mapApiVenueToVenuePublic } from '@/lib/booking/map-api-venue-to-public';
import {
  defaultStaffBookingSurfaceTab,
  getStaffBookingSurfaceTabs,
  type StaffBookingSurfaceTab,
  type StaffBookingSurfaceTabId,
} from '@/lib/booking/staff-booking-modal-options';
import { isUnifiedSchedulingVenue } from '@/lib/booking/unified-scheduling';
import type { BookingModel } from '@/types/booking-models';

export function staffSurfaceBookingWidthClass(
  surfaceTabs: StaffBookingSurfaceTab[],
  activeTab: StaffBookingSurfaceTabId,
): string {
  if (surfaceTabs.length > 1 && activeTab === 'table_reservation') return 'max-w-lg';
  if (surfaceTabs.length > 1) return 'max-w-5xl';
  return activeTab === 'table_reservation' ? 'max-w-lg' : 'max-w-5xl';
}

export interface StaffSurfaceBookingStackProps {
  bookingModel: BookingModel;
  enabledModels: BookingModel[];
  venueId: string;
  /** When omitted (e.g. dashboard modals), loaded once from GET /api/venue. */
  venue?: VenuePublic;
  currency: string;
  advancedMode?: boolean;
  onCreated: () => void;
  onClose?: () => void;
  initialDate?: string;
  initialTime?: string;
  preselectedPractitionerId?: string;
  /**
   * `walk-in`: table tab shows day-sheet/floor-plan hint instead of the table form; appointment tab uses walk-in flow.
   * `new`: full create flows (default).
   */
  bookingIntent?: 'new' | 'walk-in';
  /** Controlled tab (e.g. URL sync on /dashboard/bookings/new). Omit for internal state only. */
  activeTab?: StaffBookingSurfaceTabId;
  onActiveTabChange?: (id: StaffBookingSurfaceTabId) => void;
}

function staffSurfacePropsKey(bookingModel: BookingModel, enabledModels: BookingModel[]): string {
  return `${bookingModel}:${[...enabledModels].sort().join(',')}`;
}

/**
 * Tabbed booking-type selector when the venue exposes more than one staff booking surface; otherwise a single form.
 * Remounts when booking surfaces change so internal tab state resets without `useEffect`.
 */
export function StaffSurfaceBookingStack(props: StaffSurfaceBookingStackProps) {
  const k = staffSurfacePropsKey(props.bookingModel, props.enabledModels);
  return <StaffSurfaceBookingStackInner key={k} {...props} />;
}

function StaffSurfaceBookingStackInner({
  bookingModel,
  enabledModels,
  venueId,
  venue: venueProp,
  currency,
  advancedMode = false,
  onCreated,
  onClose,
  initialDate,
  initialTime,
  preselectedPractitionerId,
  bookingIntent = 'new',
  activeTab: controlledActiveTab,
  onActiveTabChange,
}: StaffSurfaceBookingStackProps) {
  const surfaceTabs = useMemo(
    () => getStaffBookingSurfaceTabs(bookingModel, enabledModels),
    [bookingModel, enabledModels],
  );

  const isControlled =
    typeof controlledActiveTab !== 'undefined' && typeof onActiveTabChange === 'function';

  const [internalTab, setInternalTab] = useState<StaffBookingSurfaceTabId>(() =>
    defaultStaffBookingSurfaceTab(bookingModel, enabledModels),
  );

  const activeTab = isControlled ? controlledActiveTab! : internalTab;

  const setActiveTab = (id: StaffBookingSurfaceTabId) => {
    if (isControlled) {
      onActiveTabChange!(id);
    } else {
      setInternalTab(id);
    }
  };

  /** Venue from parent when provided; otherwise filled by GET /api/venue in the effect below. */
  const [fetchedVenue, setFetchedVenue] = useState<VenuePublic | null>(null);
  const [venueError, setVenueError] = useState<string | null>(null);
  const resolvedVenue = venueProp ?? fetchedVenue;

  useEffect(() => {
    if (venueProp) {
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/venue');
        const data = (await res.json()) as Record<string, unknown>;
        if (!res.ok) {
          if (!cancelled) setVenueError(typeof data.error === 'string' ? data.error : 'Could not load venue');
          return;
        }
        if (!cancelled) {
          setFetchedVenue(mapApiVenueToVenuePublic(data));
          setVenueError(null);
        }
      } catch {
        if (!cancelled) setVenueError('Could not load venue');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [venueProp]);

  const showTabs = surfaceTabs.length > 1;
  const tabsForBar = showTabs ? surfaceTabs : [];
  const walkInDefaultSource = bookingIntent === 'walk-in' ? ('walk-in' as const) : undefined;
  const isAppointmentPlan = isUnifiedSchedulingVenue(bookingModel);

  const body = (): ReactNode => {
    if (venueError) {
      return <p className="text-sm text-red-600">{venueError}</p>;
    }
    if (!resolvedVenue) {
      return (
        <div className="flex items-center justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
        </div>
      );
    }

    const v = resolvedVenue;

    switch (activeTab) {
      case 'table_reservation':
        if (!surfaceTabs.some((t) => t.id === 'table_reservation')) return null;
        if (bookingIntent === 'walk-in') {
          return (
            <p className="text-sm leading-relaxed text-slate-600">
              Table walk-ins are added from the{' '}
              <a href="/dashboard/day-sheet" className="font-medium text-brand-700 underline underline-offset-2">
                Day sheet
              </a>{' '}
              or{' '}
              <a href="/dashboard/floor-plan" className="font-medium text-brand-700 underline underline-offset-2">
                Floor plan
              </a>
              {showTabs ? (
                <>
                  . Use the tabs above for classes, events, or resources.
                </>
              ) : (
                '.'
              )}
            </p>
          );
        }
        return (
          <UnifiedBookingForm
            venueId={venueId}
            advancedMode={advancedMode}
            venueCurrency={currency}
            initialDate={initialDate}
            initialTime={initialTime}
            onCreated={onCreated}
            onClose={onClose}
          />
        );
      case 'unified_scheduling':
        if (!surfaceTabs.some((t) => t.id === 'unified_scheduling')) return null;
        if (bookingIntent === 'new') {
          return (
            <AppointmentBookingFlow
              venue={v}
              bookingAudience="staff"
              onBookingCreated={onCreated}
              initialDate={initialDate}
              initialTime={initialTime}
              preselectedPractitionerId={preselectedPractitionerId}
            />
          );
        }
        return (
          <AppointmentWalkInModal open embedded onClose={onClose ?? (() => {})} onCreated={onCreated} currency={currency} />
        );
      case 'event_ticket':
        if (!surfaceTabs.some((t) => t.id === 'event_ticket')) return null;
        return (
          <EventBookingFlow
            venue={v}
            bookingAudience="staff"
            staffBookingSource={walkInDefaultSource ?? 'phone'}
            onBookingCreated={onCreated}
          />
        );
      case 'class_session':
        if (!surfaceTabs.some((t) => t.id === 'class_session')) return null;
        return (
          <ClassBookingFlow
            venue={v}
            bookingAudience="staff"
            staffBookingSource={walkInDefaultSource ?? 'phone'}
            onBookingCreated={onCreated}
          />
        );
      case 'resource_booking':
        if (!surfaceTabs.some((t) => t.id === 'resource_booking')) return null;
        return (
          <ResourceBookingFlow
            venue={v}
            bookingAudience="staff"
            staffBookingSource={walkInDefaultSource ?? 'phone'}
            onBookingCreated={onCreated}
          />
        );
      default:
        return null;
    }
  };

  return (
    <>
      <StaffBookingSurfaceTabsBar
        tabs={tabsForBar}
        activeId={activeTab}
        onChange={setActiveTab}
        ariaLabel={
          isAppointmentPlan
            ? 'Booking type — appointments, events, classes, resources'
            : 'Booking type — table, appointments, events, classes, resources'
        }
      />
      {body()}
    </>
  );
}
