/**
 * Builds a synthetic cancelled booking shape for waitlist matching from slot fields.
 */
import type { CancelledBookingForWaitlistOffer } from '@/lib/booking/offer-appointment-waitlist-on-cancel';

export interface WaitlistFreedSlotContext {
  venueId: string;
  slotDate: string;
  slotTime: string;
  calendarId: string | null;
  appointmentServiceId: string | null;
  serviceItemId: string | null;
  sourceBookingId?: string | null;
}

export function slotTimeHm(slotTime: string): string {
  return String(slotTime).slice(0, 5);
}

export function slotTimeForDb(slotTime: string): string {
  const hm = slotTimeHm(slotTime);
  return hm.length === 5 ? `${hm}:00` : String(slotTime);
}

export function cancelledBookingFromFreedSlot(
  ctx: WaitlistFreedSlotContext,
): CancelledBookingForWaitlistOffer {
  const timeForDb = slotTimeForDb(ctx.slotTime);
  const calendarId = ctx.calendarId;
  return {
    id: ctx.sourceBookingId ?? 'synthetic',
    venue_id: ctx.venueId,
    booking_date: ctx.slotDate,
    booking_time: timeForDb,
    practitioner_id: calendarId,
    calendar_id: calendarId,
    appointment_service_id: ctx.appointmentServiceId,
    service_item_id: ctx.serviceItemId,
  };
}

export function freedSlotFromCancelledBooking(
  booking: CancelledBookingForWaitlistOffer,
): WaitlistFreedSlotContext {
  const serviceIds = {
    appointmentServiceId: booking.appointment_service_id ?? null,
    serviceItemId: booking.service_item_id ?? null,
  };
  const calendarId = booking.calendar_id ?? booking.practitioner_id ?? null;
  return {
    venueId: booking.venue_id,
    slotDate: booking.booking_date,
    slotTime: booking.booking_time,
    calendarId,
    appointmentServiceId: serviceIds.appointmentServiceId,
    serviceItemId: serviceIds.serviceItemId,
    sourceBookingId: booking.id,
  };
}
