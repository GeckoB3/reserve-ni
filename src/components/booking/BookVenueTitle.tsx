'use client';

import { useCallback, type MouseEvent } from 'react';
import { APPOINTMENT_BOOKING_RESET_EVENT } from './appointment-booking-events';

interface BookVenueTitleProps {
  name: string;
  /** When true, the title restarts the appointment booking flow (Model B). */
  isAppointment: boolean;
  className?: string;
}

function scrollToBookingFormStart() {
  document.getElementById('booking-form-start')?.scrollIntoView({ behavior: 'smooth' });
}

const titleControlClassName =
  'block w-full max-w-full cursor-pointer text-left text-white/70 no-underline ' +
  'hover:text-white ' +
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900';

/**
 * Public book page venue name. Links to the start of the booking form; for appointment businesses, also restarts the flow.
 */
export function BookVenueTitle({ name, isAppointment, className }: BookVenueTitleProps) {
  const headingClass = className ?? 'text-2xl font-bold sm:text-3xl';

  const onTitleClick = useCallback(
    (e: MouseEvent<HTMLAnchorElement>) => {
      e.preventDefault();
      if (isAppointment) {
        window.dispatchEvent(new CustomEvent(APPOINTMENT_BOOKING_RESET_EVENT));
      }
      scrollToBookingFormStart();
    },
    [isAppointment],
  );

  return (
    <h1 className={headingClass}>
      <a
        href="#booking-form-start"
        onClick={onTitleClick}
        className={titleControlClassName}
        title={isAppointment ? 'Start booking again' : 'Back to booking form'}
      >
        <span className="block min-w-0 break-words">{name}</span>
      </a>
    </h1>
  );
}
