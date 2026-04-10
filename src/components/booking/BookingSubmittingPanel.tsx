'use client';

export type BookingSubmittingVariant = 'table' | 'appointment' | 'event' | 'class' | 'resource';

const TITLES: Record<BookingSubmittingVariant, string> = {
  table: 'Booking your table…',
  appointment: 'Booking your appointment…',
  event: 'Booking your event…',
  class: 'Booking your class…',
  resource: 'Completing your booking…',
};

interface BookingSubmittingPanelProps {
  variant: BookingSubmittingVariant;
}

/**
 * Full-column loading state shown while guest booking API requests are in flight.
 * Replaces DetailsStep so the wait feels intentional (not a static form).
 */
export function BookingSubmittingPanel({ variant }: BookingSubmittingPanelProps) {
  const title = TITLES[variant];

  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy={true}
      className="flex min-h-[280px] flex-col items-center justify-center rounded-2xl border border-slate-200 bg-slate-50/80 px-6 py-16 text-center"
    >
      <div
        className="h-10 w-10 animate-spin rounded-full border-2 border-brand-600 border-t-transparent"
        aria-hidden={true}
      />
      <p className="mt-6 text-base font-semibold text-slate-900">{title}</p>
      <p className="mt-2 max-w-sm text-sm text-slate-500">This usually takes a few seconds.</p>
    </div>
  );
}
