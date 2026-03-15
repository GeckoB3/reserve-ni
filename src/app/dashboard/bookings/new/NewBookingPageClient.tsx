'use client';

import { ToastProvider } from '@/components/ui/Toast';
import { UnifiedBookingForm } from '@/components/booking/UnifiedBookingForm';

export function NewBookingPageClient({
  venueId,
  advancedMode,
}: {
  venueId: string;
  advancedMode: boolean;
}) {
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
