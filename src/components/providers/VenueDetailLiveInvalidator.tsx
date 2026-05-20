'use client';

import { useCallback, useMemo } from 'react';
import { useSWRConfig } from 'swr';
import { useDashboardToolbarVenue } from '@/components/dashboard/toolbar-guest-search/DashboardToolbarVenueProvider';
import { useVenuePostgresLiveSync } from '@/lib/realtime/useVenuePostgresLiveSync';
import {
  venueBookingDetailKey,
  venueBookingSummaryKey,
} from '@/lib/dashboard/venue-detail-swr';

function isVenueBookingDetailKey(key: unknown): key is ReturnType<typeof venueBookingDetailKey> {
  return Array.isArray(key) && key[0] === 'venue-booking-detail' && typeof key[1] === 'string';
}

function isVenueBookingSummaryKey(key: unknown): key is ReturnType<typeof venueBookingSummaryKey> {
  return Array.isArray(key) && key[0] === 'venue-booking-summary' && typeof key[1] === 'string';
}

function bookingIdFromPayload(payload: {
  new?: Record<string, unknown>;
  old?: Record<string, unknown>;
}): string | null {
  const raw = payload.new?.id ?? payload.old?.id;
  return typeof raw === 'string' ? raw : null;
}

function bookingIdFromAssignmentPayload(payload: {
  new?: Record<string, unknown>;
  old?: Record<string, unknown>;
}): string | null {
  const raw = payload.new?.booking_id ?? payload.old?.booking_id;
  return typeof raw === 'string' ? raw : null;
}

/**
 * Keeps cached booking detail/summary SWR entries fresh when another staff member
 * or a webhook updates bookings outside bookings/contacts list views.
 */
export function VenueDetailLiveInvalidator() {
  const { venueId } = useDashboardToolbarVenue();
  const { mutate } = useSWRConfig();

  const invalidateBooking = useCallback(
    (bookingId: string) => {
      void mutate(venueBookingDetailKey(bookingId), undefined, { revalidate: true });
      void mutate(venueBookingSummaryKey(bookingId), undefined, { revalidate: true });
    },
    [mutate],
  );

  const revalidateCachedBookings = useCallback(() => {
    void mutate(
      (key) => isVenueBookingDetailKey(key) || isVenueBookingSummaryKey(key),
      undefined,
      { revalidate: true },
    );
  }, [mutate]);

  const subscriptions = useMemo(
    () => [
      {
        table: 'bookings',
        filter: `venue_id=eq.${venueId}`,
        handler: (payload: { new?: Record<string, unknown>; old?: Record<string, unknown> }) => {
          const id = bookingIdFromPayload(payload);
          if (id) invalidateBooking(id);
        },
      },
      {
        table: 'booking_table_assignments',
        handler: (payload: { new?: Record<string, unknown>; old?: Record<string, unknown> }) => {
          const id = bookingIdFromAssignmentPayload(payload);
          if (id) invalidateBooking(id);
        },
      },
    ],
    [invalidateBooking, venueId],
  );

  useVenuePostgresLiveSync({
    venueId,
    onRefresh: revalidateCachedBookings,
    subscriptions,
  });

  return null;
}
