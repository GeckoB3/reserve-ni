'use client';

import { useCallback } from 'react';
import { APPOINTMENT_BOOKING_RESET_EVENT } from './appointment-booking-events';

interface BookVenueTitleProps {
  name: string;
  /** When true, the title restarts the appointment booking flow (Model B). */
  isAppointment: boolean;
  className?: string;
}

/**
 * Public book page venue name. For appointment businesses, acts as a control to return to the start of the flow.
 */
export function BookVenueTitle({ name, isAppointment, className }: BookVenueTitleProps) {
  const headingClass = className ?? 'text-2xl font-bold text-white sm:text-3xl';

  const onStartOver = useCallback(() => {
    window.dispatchEvent(new CustomEvent(APPOINTMENT_BOOKING_RESET_EVENT));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  if (!isAppointment) {
    return <h1 className={headingClass}>{name}</h1>;
  }

  return (
    <h1 className={headingClass}>
      <button
        type="button"
        onClick={onStartOver}
        className="max-w-full cursor-pointer rounded-lg px-2 py-1.5 -mx-2 -my-1 text-left transition-[background-color,transform,box-shadow] duration-200 ease-out hover:bg-white/12 hover:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.14)] active:scale-[0.985] active:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
        title="Start booking again"
      >
        <span className="block min-w-0 break-words">{name}</span>
      </button>
    </h1>
  );
}
