'use client';

import { StaffSurfaceBookingStack } from '@/components/booking/StaffSurfaceBookingStack';
import type { BookingModel } from '@/types/booking-models';

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
  const title = intent === 'new' ? 'New booking' : 'Walk-in';

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="calendar-staff-booking-title"
        className="max-h-[min(90dvh,90vh)] w-full max-w-5xl overflow-y-auto rounded-t-2xl bg-white p-6 shadow-xl sm:rounded-2xl"
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

        <StaffSurfaceBookingStack
          bookingModel={bookingModel}
          enabledModels={enabledModels}
          venueId={venueId}
          currency={currency}
          advancedMode={advancedMode}
          bookingIntent={intent}
          onCreated={onCreated}
          onClose={onClose}
          initialDate={preselectedDate}
          initialTime={preselectedTime}
          preselectedPractitionerId={preselectedPractitionerId}
        />
      </div>
    </div>
  );
}
