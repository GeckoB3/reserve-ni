'use client';

import Link from 'next/link';
import { FloorPlanLiveView } from './FloorPlanLiveView';
import type { BookingModel } from '@/types/booking-models';

export function UnifiedFloorPlanView({
  isAdmin,
  venueId,
  currency,
  bookingModel = 'table_reservation',
  enabledModels = [],
}: {
  isAdmin: boolean;
  venueId: string;
  currency?: string;
  bookingModel?: BookingModel;
  enabledModels?: BookingModel[];
}) {
  return (
    <div className="space-y-2 sm:space-y-3">
      <div className="flex items-center justify-end">
        {isAdmin && (
          <Link
            href="/dashboard/availability?tab=table&fp=layout"
            className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-amber-600 sm:px-3 sm:py-2 sm:text-sm"
          >
            Edit Layout
          </Link>
        )}
      </div>
      <FloorPlanLiveView
        isAdmin={isAdmin}
        venueId={venueId}
        currency={currency}
        bookingModel={bookingModel}
        enabledModels={enabledModels}
      />
    </div>
  );
}
