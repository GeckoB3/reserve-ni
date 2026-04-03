'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState, type ReactNode } from 'react';
import { ToastProvider } from '@/components/ui/Toast';
import { UnifiedBookingForm } from '@/components/booking/UnifiedBookingForm';
import { AppointmentBookingForm } from '@/components/booking/AppointmentBookingForm';
import { StaffEventBookingForm } from '@/components/booking/StaffEventBookingForm';
import { StaffClassBookingForm } from '@/components/booking/StaffClassBookingForm';
import { StaffResourceBookingForm } from '@/components/booking/StaffResourceBookingForm';
import { isUnifiedSchedulingVenue } from '@/lib/booking/unified-scheduling';
import type { BookingModel } from '@/types/booking-models';

type StaffExtra = 'none' | 'event' | 'class' | 'resource';

export function NewBookingPageClient({
  venueId,
  advancedMode,
  bookingModel = 'table_reservation',
  currency = 'GBP',
  enabledModels = [],
}: {
  venueId: string;
  advancedMode: boolean;
  bookingModel?: BookingModel;
  currency?: string;
  enabledModels?: BookingModel[];
}) {
  const router = useRouter();
  const isAppointment = isUnifiedSchedulingVenue(bookingModel);

  const canStaffEventBooking =
    bookingModel === 'event_ticket' || enabledModels.includes('event_ticket');
  const canStaffClassBooking =
    bookingModel === 'class_session' || enabledModels.includes('class_session');
  const canStaffResourceBooking =
    bookingModel === 'resource_booking' || enabledModels.includes('resource_booking');

  const secondaryOptions = useMemo(() => {
    const opts: { value: Exclude<StaffExtra, 'none'>; label: string }[] = [];
    if (canStaffEventBooking && bookingModel !== 'event_ticket') {
      opts.push({ value: 'event', label: 'Event tickets' });
    }
    if (canStaffClassBooking && bookingModel !== 'class_session') {
      opts.push({ value: 'class', label: 'Classes' });
    }
    if (canStaffResourceBooking && bookingModel !== 'resource_booking') {
      opts.push({ value: 'resource', label: 'Resources' });
    }
    return opts;
  }, [
    bookingModel,
    canStaffClassBooking,
    canStaffEventBooking,
    canStaffResourceBooking,
  ]);

  const [staffExtra, setStaffExtra] = useState<StaffExtra>('none');

  const primaryLabel = isAppointment ? 'Appointment' : 'Table reservation';

  const wrapToast = (node: ReactNode) => (
    <div className="p-4 md:p-6 lg:p-8">
      <ToastProvider>{node}</ToastProvider>
    </div>
  );

  if (bookingModel === 'class_session') {
    return wrapToast(
      <StaffClassBookingForm venueId={venueId} currency={currency} onCreated={() => router.push('/dashboard/bookings')} />,
    );
  }

  if (bookingModel === 'resource_booking') {
    return wrapToast(
      <StaffResourceBookingForm venueId={venueId} currency={currency} onCreated={() => router.push('/dashboard/bookings')} />,
    );
  }

  if (bookingModel === 'event_ticket') {
    return wrapToast(
      <StaffEventBookingForm venueId={venueId} currency={currency} onCreated={() => router.push('/dashboard/bookings')} />,
    );
  }

  if (isAppointment && secondaryOptions.length > 0) {
    return (
      <div className="p-4 md:p-6 lg:p-8">
        <div className="mx-auto max-w-5xl">
          <h1 className="mb-6 text-2xl font-semibold text-slate-900">New Booking</h1>
          <div className="mb-6">
            <label className="mb-1 block text-sm font-medium text-slate-700">Booking type</label>
            <select
              value={staffExtra}
              onChange={(e) => setStaffExtra(e.target.value as StaffExtra)}
              className="w-full max-w-md rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
            >
              <option value="none">{primaryLabel}</option>
              {secondaryOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          {staffExtra === 'none' && (
            <AppointmentBookingForm
              open
              onClose={() => router.push('/dashboard/bookings')}
              onCreated={() => router.push('/dashboard/bookings')}
              venueId={venueId}
              currency={currency}
            />
          )}
          {staffExtra === 'event' && (
            <ToastProvider>
              <StaffEventBookingForm venueId={venueId} currency={currency} onCreated={() => router.push('/dashboard/bookings')} />
            </ToastProvider>
          )}
          {staffExtra === 'class' && (
            <ToastProvider>
              <StaffClassBookingForm venueId={venueId} currency={currency} onCreated={() => router.push('/dashboard/bookings')} />
            </ToastProvider>
          )}
          {staffExtra === 'resource' && (
            <ToastProvider>
              <StaffResourceBookingForm venueId={venueId} currency={currency} onCreated={() => router.push('/dashboard/bookings')} />
            </ToastProvider>
          )}
        </div>
      </div>
    );
  }

  if (isAppointment) {
    return (
      <AppointmentBookingForm
        open
        onClose={() => router.push('/dashboard/bookings')}
        onCreated={() => router.push('/dashboard/bookings')}
        venueId={venueId}
        currency={currency}
      />
    );
  }

  if (secondaryOptions.length > 0) {
    return (
      <div className="p-4 md:p-6 lg:p-8">
        <div className="mx-auto max-w-lg">
          <h1 className="mb-6 text-2xl font-semibold text-slate-900">New Booking</h1>
          <div className="mb-6">
            <label className="mb-1 block text-sm font-medium text-slate-700">Booking type</label>
            <select
              value={staffExtra}
              onChange={(e) => setStaffExtra(e.target.value as StaffExtra)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
            >
              <option value="none">{primaryLabel}</option>
              {secondaryOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <ToastProvider>
            {staffExtra === 'none' && (
              <UnifiedBookingForm
                venueId={venueId}
                advancedMode={advancedMode}
                onCreated={() => router.push('/dashboard/bookings')}
              />
            )}
            {staffExtra === 'event' && (
              <StaffEventBookingForm venueId={venueId} currency={currency} onCreated={() => router.push('/dashboard/bookings')} />
            )}
            {staffExtra === 'class' && (
              <StaffClassBookingForm venueId={venueId} currency={currency} onCreated={() => router.push('/dashboard/bookings')} />
            )}
            {staffExtra === 'resource' && (
              <StaffResourceBookingForm venueId={venueId} currency={currency} onCreated={() => router.push('/dashboard/bookings')} />
            )}
          </ToastProvider>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 lg:p-8">
      <div className="mx-auto max-w-lg">
        <h1 className="mb-6 text-2xl font-semibold text-slate-900">New Booking</h1>
        <ToastProvider>
          <UnifiedBookingForm venueId={venueId} advancedMode={advancedMode} onCreated={() => {}} />
        </ToastProvider>
      </div>
    </div>
  );
}
