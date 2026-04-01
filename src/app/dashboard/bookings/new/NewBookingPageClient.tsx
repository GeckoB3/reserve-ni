'use client';

import { useRouter } from 'next/navigation';
import { ToastProvider } from '@/components/ui/Toast';
import { UnifiedBookingForm } from '@/components/booking/UnifiedBookingForm';
import { AppointmentBookingForm } from '@/components/booking/AppointmentBookingForm';
import { isUnifiedSchedulingVenue } from '@/lib/booking/unified-scheduling';

export function NewBookingPageClient({
  venueId,
  advancedMode,
  bookingModel = 'table_reservation',
  currency = 'GBP',
}: {
  venueId: string;
  advancedMode: boolean;
  bookingModel?: string;
  currency?: string;
}) {
  const router = useRouter();
  const isAppointment = isUnifiedSchedulingVenue(bookingModel);

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

  return (
    <div className="p-4 md:p-6 lg:p-8">
      <div className="mx-auto max-w-lg">
        <h1 className="mb-6 text-2xl font-semibold text-slate-900">New Booking</h1>
        <ToastProvider>
          <UnifiedBookingForm
            venueId={venueId}
            advancedMode={advancedMode}
            onCreated={() => {}}
          />
        </ToastProvider>
      </div>
    </div>
  );
}
