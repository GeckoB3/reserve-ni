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
 *
 * Architecture (Unified Scheduling Engine plan):
 * - **table_reservation** — restaurant `BookingFlow`.
 * - **unified_scheduling** — practitioner-style flow backed by `unified_calendars` +
 *   `service_items` + `calendar_service_assignments`.
 * - **event_ticket / class_session / resource_booking** — legacy dedicated flows for venues
 *   still on those enum values. Engine/API support for event/class/resource under USE exists
 *   (`getUnifiedAvailableSlots`, `event_sessions`); full UI consolidation is a future cutover.
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
    case 'unified_scheduling':
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
