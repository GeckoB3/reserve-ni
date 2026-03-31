'use client';

import type { VenuePublic } from './types';
import { BookingFlow } from './BookingFlow';
import { AppointmentBookingFlow } from './AppointmentBookingFlow';
import { EventBookingFlow } from './EventBookingFlow';
import { ClassBookingFlow } from './ClassBookingFlow';
import { ResourceBookingFlow } from './ResourceBookingFlow';

export interface LockedPractitionerBooking {
  id: string;
  name: string;
  /** URL segment; passed as practitioner_slug to appointment catalog */
  bookingSlug: string;
}

interface Props {
  venue: VenuePublic;
  embed?: boolean;
  onHeightChange?: (height: number) => void;
  cancellationPolicy?: string;
  accentColour?: string;
  /** Model B: pre-selected practitioner from /book/{venue}/{practitioner-slug} */
  lockedPractitioner?: LockedPractitionerBooking | null;
}

/**
 * Renders the correct booking flow component based on the venue's booking model.
 * Model A (table_reservation) uses the existing BookingFlow.
 * Models B–E use their dedicated flows.
 */
export function BookingFlowRouter({
  venue,
  embed,
  onHeightChange,
  cancellationPolicy,
  accentColour,
  lockedPractitioner,
}: Props) {
  switch (venue.booking_model) {
    case 'practitioner_appointment':
      return (
        <AppointmentBookingFlow
          venue={venue}
          cancellationPolicy={cancellationPolicy}
          embed={embed}
          onHeightChange={onHeightChange}
          accentColour={accentColour}
          lockedPractitioner={lockedPractitioner ?? undefined}
        />
      );
    case 'event_ticket':
      return <EventBookingFlow venue={venue} cancellationPolicy={cancellationPolicy} />;
    case 'class_session':
      return <ClassBookingFlow venue={venue} cancellationPolicy={cancellationPolicy} />;
    case 'resource_booking':
      return <ResourceBookingFlow venue={venue} cancellationPolicy={cancellationPolicy} />;
    default:
      return (
        <BookingFlow
          venue={venue}
          embed={embed}
          onHeightChange={onHeightChange}
          cancellationPolicy={cancellationPolicy}
          accentColour={accentColour}
        />
      );
  }
}
