'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { StaffBookingSurfaceTabsBar } from '@/components/booking/StaffBookingSurfaceTabsBar';
import { UnifiedBookingForm } from '@/components/booking/UnifiedBookingForm';
import { AppointmentBookingForm } from '@/components/booking/AppointmentBookingForm';
import { AppointmentWalkInModal } from '@/components/booking/AppointmentWalkInModal';
import { StaffEventBookingForm } from '@/components/booking/StaffEventBookingForm';
import { StaffClassBookingForm } from '@/components/booking/StaffClassBookingForm';
import { StaffResourceBookingForm } from '@/components/booking/StaffResourceBookingForm';
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

  const showTabs = surfaceTabs.length > 1;
  const tabsForBar = showTabs ? surfaceTabs : [];
  const walkInDefaultSource = bookingIntent === 'walk-in' ? ('walk-in' as const) : undefined;
  const isAppointmentPlan = isUnifiedSchedulingVenue(bookingModel);

  const body = (): ReactNode => {
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
            <AppointmentBookingForm
              open
              embedded
              onClose={onClose ?? onCreated}
              onCreated={onCreated}
              venueId={venueId}
              currency={currency}
              preselectedDate={initialDate}
              preselectedPractitionerId={preselectedPractitionerId}
              preselectedTime={initialTime}
            />
          );
        }
        return (
          <AppointmentWalkInModal open embedded onClose={onClose ?? (() => {})} onCreated={onCreated} currency={currency} />
        );
      case 'event_ticket':
        if (!surfaceTabs.some((t) => t.id === 'event_ticket')) return null;
        return (
          <StaffEventBookingForm
            venueId={venueId}
            currency={currency}
            embedded
            initialDate={initialDate}
            defaultSource={walkInDefaultSource}
            onCreated={onCreated}
          />
        );
      case 'class_session':
        if (!surfaceTabs.some((t) => t.id === 'class_session')) return null;
        return (
          <StaffClassBookingForm
            venueId={venueId}
            currency={currency}
            embedded
            initialDate={initialDate}
            defaultSource={walkInDefaultSource}
            onCreated={onCreated}
          />
        );
      case 'resource_booking':
        if (!surfaceTabs.some((t) => t.id === 'resource_booking')) return null;
        return (
          <StaffResourceBookingForm
            venueId={venueId}
            currency={currency}
            embedded
            initialDate={initialDate}
            defaultSource={walkInDefaultSource}
            onCreated={onCreated}
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
