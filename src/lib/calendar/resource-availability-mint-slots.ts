import {
  computeResourceAvailability,
  type ResourceBooking,
} from '@/lib/availability/resource-booking-engine';
import { timeToMinutes } from '@/lib/availability';
import { sameDaySlotCutoffForBookingDate } from '@/lib/venue/venue-local-clock';
import type { VenueResource } from '@/types/booking-models';

export interface ResourceAvailabilityMintSlot {
  top: number;
  height: number;
  resourceName: string;
}

/** Free resource start times as positioned mint blocks for a host staff column. */
export function computeResourceAvailabilityMintSlots(params: {
  date: string;
  venueTimezone: string;
  resources: VenueResource[];
  existingBookings: ResourceBooking[];
  startHour: number;
  slotHeightPx: number;
  slotMinutes: number;
}): ResourceAvailabilityMintSlot[] {
  const { date, venueTimezone, resources, existingBookings, startHour, slotHeightPx, slotMinutes } =
    params;
  const mint: ResourceAvailabilityMintSlot[] = [];
  const sameDaySlotCutoff = sameDaySlotCutoffForBookingDate(date, venueTimezone) ?? undefined;

  for (const vr of resources) {
    if (!vr.is_active) continue;
    const resourceBookings = existingBookings.filter(
      (b) => b.resource_id === vr.id && ['Booked', 'Confirmed', 'Pending', 'Seated'].includes(b.status),
    );
    const results = computeResourceAvailability(
      { date, resources: [vr], existingBookings: resourceBookings, sameDaySlotCutoff },
      vr.min_booking_minutes,
    );
    const res0 = results[0];
    if (!res0) continue;
    const dur = Math.max(
      vr.min_booking_minutes,
      Math.min(vr.min_booking_minutes, vr.max_booking_minutes),
    );
    for (const slot of res0.slots) {
      const startM = timeToMinutes(slot.start_time);
      mint.push({
        top: ((startM - startHour * 60) / slotMinutes) * slotHeightPx,
        height: Math.max((dur / slotMinutes) * slotHeightPx, slotHeightPx),
        resourceName: vr.name,
      });
    }
  }

  return mint;
}
