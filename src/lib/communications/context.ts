import type { BookingEmailData, VenueEmailData } from '@/lib/emails/types';
import { formatDate, formatDepositAmount, formatTime } from '@/lib/emails/templates/base-template';
import type { CommunicationLane } from './policies';

export interface CommunicationContentContext {
  lane: CommunicationLane;
  isAppointmentLane: boolean;
  bookingLabel: string;
  bookingLabelWithStaff: string;
  guestName: string;
  venueName: string;
  venueAddress: string | null;
  venuePhone: string | null;
  bookingDateText: string;
  bookingTimeText: string;
  partySize: number;
  depositAmountText: string | null;
}

export function buildCommunicationContentContext(
  lane: CommunicationLane,
  booking: BookingEmailData,
  venue: VenueEmailData,
): CommunicationContentContext {
  const isAppointmentLane = lane === 'appointments_other';
  const bookingLabel =
    booking.appointment_service_name?.trim() || 'booking';
  const bookingLabelWithStaff = booking.practitioner_name?.trim()
    ? `${bookingLabel} with ${booking.practitioner_name.trim()}`
    : bookingLabel;

  return {
    lane,
    isAppointmentLane,
    bookingLabel,
    bookingLabelWithStaff,
    guestName: booking.guest_name || 'Guest',
    venueName: venue.name,
    venueAddress: venue.address ?? null,
    venuePhone: venue.phone ?? null,
    bookingDateText: formatDate(booking.booking_date),
    bookingTimeText: formatTime(booking.booking_time),
    partySize: booking.party_size,
    depositAmountText:
      typeof booking.deposit_amount_pence === 'number'
        ? `£${formatDepositAmount(booking.deposit_amount_pence)}`
        : null,
  };
}
