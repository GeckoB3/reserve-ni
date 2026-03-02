'use client';

import type { GuestDetails, VenuePublic } from './types';

interface ConfirmationStepProps {
  venue: VenuePublic;
  date: string;
  slot: { label: string; start_time: string };
  partySize: number;
  guest: GuestDetails;
  bookingId: string | undefined;
}

export function ConfirmationStep({ venue, date, slot, partySize, guest, bookingId }: ConfirmationStepProps) {
  const dateStr = new Date(date + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <div className="mt-6 space-y-6">
      <div className="rounded border border-green-200 bg-green-50 p-4 text-green-800">
        <p className="font-medium">Booking confirmed</p>
        <p className="mt-1 text-sm">Your reservation is confirmed. You will receive a confirmation email shortly.</p>
      </div>

      <dl className="space-y-2 text-sm">
        <div>
          <dt className="text-neutral-500">Venue</dt>
          <dd className="font-medium">{venue.name}</dd>
        </div>
        <div>
          <dt className="text-neutral-500">Date & time</dt>
          <dd className="font-medium">{dateStr}, {slot.label} ({slot.start_time})</dd>
        </div>
        <div>
          <dt className="text-neutral-500">Party size</dt>
          <dd className="font-medium">{partySize} {partySize === 1 ? 'guest' : 'guests'}</dd>
        </div>
        <div>
          <dt className="text-neutral-500">Name</dt>
          <dd className="font-medium">{guest.name}</dd>
        </div>
        {guest.email && (
          <div>
            <dt className="text-neutral-500">Email</dt>
            <dd className="font-medium">{guest.email}</dd>
          </div>
        )}
        <div>
          <dt className="text-neutral-500">Phone</dt>
          <dd className="font-medium">{guest.phone}</dd>
        </div>
      </dl>

      <div className="rounded border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <p className="font-medium">Cancellation policy</p>
        <p className="mt-1">Full refund if cancelled 48+ hours before your reservation. No refund if cancelled within 48 hours or no-show.</p>
      </div>

      <p className="text-sm text-neutral-600">
        A confirmation email has been sent to {guest.email || 'your phone'} with these details.
      </p>
    </div>
  );
}
