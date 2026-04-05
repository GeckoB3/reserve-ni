'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { AppointmentBookingForm } from '@/components/booking/AppointmentBookingForm';
import { AppointmentWalkInModal } from '@/components/booking/AppointmentWalkInModal';
import { UnifiedBookingForm } from '@/components/booking/UnifiedBookingForm';
import { StaffEventBookingForm } from '@/components/booking/StaffEventBookingForm';
import { StaffClassBookingForm } from '@/components/booking/StaffClassBookingForm';
import { StaffResourceBookingForm } from '@/components/booking/StaffResourceBookingForm';
import { isUnifiedSchedulingVenue } from '@/lib/booking/unified-scheduling';
import type { BookingModel } from '@/types/booking-models';
import {
  primaryStaffBookingLabel,
  staffSecondaryBookingOptions,
  type StaffBookingExtraTab,
} from '@/lib/booking/staff-booking-modal-options';

export interface CalendarStaffBookingModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  venueId: string;
  currency: string;
  bookingModel: BookingModel;
  enabledModels: BookingModel[];
  intent: 'new' | 'walk-in';
  /** Table booking: match New booking page (floor plan assignment). */
  advancedMode?: boolean;
  preselectedDate?: string;
  preselectedPractitionerId?: string;
  preselectedTime?: string;
}

/**
 * Staff booking flows for the practitioner calendar toolbar (parity with `/dashboard/bookings/new`
 * and public multi-tab booking): primary model + enabled secondaries.
 */
export function CalendarStaffBookingModal({
  open,
  onClose,
  onCreated,
  venueId,
  currency,
  bookingModel,
  enabledModels,
  intent,
  advancedMode = false,
  preselectedDate,
  preselectedPractitionerId,
  preselectedTime,
}: CalendarStaffBookingModalProps) {
  const secondaryOptions = useMemo(
    () => staffSecondaryBookingOptions(bookingModel, enabledModels),
    [bookingModel, enabledModels],
  );
  const [staffExtra, setStaffExtra] = useState<StaffBookingExtraTab>('none');

  const isAppointment = isUnifiedSchedulingVenue(bookingModel);
  const primaryLabel = primaryStaffBookingLabel(bookingModel);
  const walkInDefaultSource = intent === 'walk-in' ? ('walk-in' as const) : undefined;
  const showTypeSelector = secondaryOptions.length > 0;

  const title = intent === 'new' ? 'New booking' : 'Walk-in';

  if (!open) return null;

  function renderBody(): ReactNode {
    if (bookingModel === 'class_session') {
      return (
        <StaffClassBookingForm
          venueId={venueId}
          currency={currency}
          embedded
          initialDate={preselectedDate}
          defaultSource={walkInDefaultSource}
          onCreated={onCreated}
        />
      );
    }

    if (bookingModel === 'resource_booking') {
      return (
        <StaffResourceBookingForm
          venueId={venueId}
          currency={currency}
          embedded
          initialDate={preselectedDate}
          defaultSource={walkInDefaultSource}
          onCreated={onCreated}
        />
      );
    }

    if (bookingModel === 'event_ticket') {
      return (
        <StaffEventBookingForm
          venueId={venueId}
          currency={currency}
          embedded
          initialDate={preselectedDate}
          defaultSource={walkInDefaultSource}
          onCreated={onCreated}
        />
      );
    }

    if (isAppointment && secondaryOptions.length > 0) {
      return (
        <>
          {staffExtra === 'none' && intent === 'new' && (
            <AppointmentBookingForm
              open
              embedded
              onClose={onClose}
              onCreated={onCreated}
              venueId={venueId}
              currency={currency}
              preselectedDate={preselectedDate}
              preselectedPractitionerId={preselectedPractitionerId}
              preselectedTime={preselectedTime}
            />
          )}
          {staffExtra === 'none' && intent === 'walk-in' && (
            <AppointmentWalkInModal
              open
              embedded
              onClose={onClose}
              onCreated={onCreated}
              currency={currency}
            />
          )}
          {staffExtra === 'event' && (
            <StaffEventBookingForm
              venueId={venueId}
              currency={currency}
              embedded
              initialDate={preselectedDate}
              defaultSource={walkInDefaultSource}
              onCreated={onCreated}
            />
          )}
          {staffExtra === 'class' && (
            <StaffClassBookingForm
              venueId={venueId}
              currency={currency}
              embedded
              initialDate={preselectedDate}
              defaultSource={walkInDefaultSource}
              onCreated={onCreated}
            />
          )}
          {staffExtra === 'resource' && (
            <StaffResourceBookingForm
              venueId={venueId}
              currency={currency}
              embedded
              initialDate={preselectedDate}
              defaultSource={walkInDefaultSource}
              onCreated={onCreated}
            />
          )}
        </>
      );
    }

    if (isAppointment) {
      if (intent === 'new') {
        return (
          <AppointmentBookingForm
            open
            embedded
            onClose={onClose}
            onCreated={onCreated}
            venueId={venueId}
            currency={currency}
            preselectedDate={preselectedDate}
            preselectedPractitionerId={preselectedPractitionerId}
            preselectedTime={preselectedTime}
          />
        );
      }
      return (
        <AppointmentWalkInModal open embedded onClose={onClose} onCreated={onCreated} currency={currency} />
      );
    }

    if (secondaryOptions.length > 0) {
      return (
        <>
          {staffExtra === 'none' && intent === 'new' && (
            <UnifiedBookingForm
              venueId={venueId}
              advancedMode={advancedMode}
              venueCurrency={currency}
              initialDate={preselectedDate}
              initialTime={preselectedTime}
              onCreated={() => onCreated()}
            />
          )}
          {staffExtra === 'none' && intent === 'walk-in' && (
            <p className="text-sm leading-relaxed text-slate-600">
              Table walk-ins are added from the{' '}
              <a href="/dashboard/day-sheet" className="font-medium text-brand-700 underline underline-offset-2">
                Day sheet
              </a>{' '}
              or{' '}
              <a href="/dashboard/floor-plan" className="font-medium text-brand-700 underline underline-offset-2">
                Floor plan
              </a>
              . Use the booking type menu above for classes, events, or resources.
            </p>
          )}
          {staffExtra === 'event' && (
            <StaffEventBookingForm
              venueId={venueId}
              currency={currency}
              embedded
              initialDate={preselectedDate}
              defaultSource={walkInDefaultSource}
              onCreated={onCreated}
            />
          )}
          {staffExtra === 'class' && (
            <StaffClassBookingForm
              venueId={venueId}
              currency={currency}
              embedded
              initialDate={preselectedDate}
              defaultSource={walkInDefaultSource}
              onCreated={onCreated}
            />
          )}
          {staffExtra === 'resource' && (
            <StaffResourceBookingForm
              venueId={venueId}
              currency={currency}
              embedded
              initialDate={preselectedDate}
              defaultSource={walkInDefaultSource}
              onCreated={onCreated}
            />
          )}
        </>
      );
    }

    if (intent === 'new') {
      return (
        <UnifiedBookingForm
          venueId={venueId}
          advancedMode={advancedMode}
          venueCurrency={currency}
          initialDate={preselectedDate}
          initialTime={preselectedTime}
          onCreated={() => onCreated()}
        />
      );
    }

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
        .
      </p>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="calendar-staff-booking-title"
        className="max-h-[min(90dvh,90vh)] w-full max-w-2xl overflow-y-auto rounded-t-2xl bg-white p-6 shadow-xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between gap-2">
          <h2 id="calendar-staff-booking-title" className="text-lg font-semibold text-slate-900">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {showTypeSelector && (
          <div className="mb-4">
            <label htmlFor="calendar-booking-type" className="mb-1 block text-sm font-medium text-slate-700">
              Booking type
            </label>
            <select
              id="calendar-booking-type"
              value={staffExtra}
              onChange={(e) => setStaffExtra(e.target.value as StaffBookingExtraTab)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            >
              <option value="none">{primaryLabel}</option>
              {secondaryOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        )}

        {renderBody()}
      </div>
    </div>
  );
}
