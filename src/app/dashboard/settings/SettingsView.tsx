'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import type { VenueSettings } from './types';
import { ProfileSection } from './sections/ProfileSection';
import { VenueProfileSection } from './sections/VenueProfileSection';
import { OpeningHoursSection } from './sections/OpeningHoursSection';
import { AvailabilityConfigSection } from './sections/AvailabilityConfigSection';
import { BookingRulesSection } from './sections/BookingRulesSection';
import { DepositConfigSection } from './sections/DepositConfigSection';
import { StaffSection } from './sections/StaffSection';
import { CommunicationTemplatesSection } from './sections/CommunicationTemplatesSection';
import { StripeConnectSection } from './sections/StripeConnectSection';

interface SettingsViewProps {
  initialVenue: VenueSettings | null;
  isAdmin: boolean;
}

export function SettingsView({ initialVenue, isAdmin }: SettingsViewProps) {
  const [venue, setVenue] = useState<VenueSettings | null>(initialVenue);

  const onUpdate = useCallback((patch: Partial<VenueSettings>) => {
    setVenue((v) => (v ? { ...v, ...patch } : null));
  }, []);

  if (!venue) {
    return (
      <div className="rounded-lg border border-neutral-200 bg-white p-6 text-neutral-600">
        Loading venue…
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <ProfileSection />
      <VenueProfileSection venue={venue} onUpdate={onUpdate} isAdmin={isAdmin} />
      <StripeConnectSection stripeAccountId={venue.stripe_connected_account_id} isAdmin={isAdmin} />
      <div className="rounded-lg border border-neutral-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-neutral-900">Booking widget & QR code</h2>
        <p className="mt-1 text-sm text-neutral-600">Get embed code and a printable QR code for your booking page.</p>
        <Link href="/dashboard/settings/widget" className="mt-3 inline-block rounded bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800">Open widget settings</Link>
      </div>
      <OpeningHoursSection venue={venue} onUpdate={onUpdate} isAdmin={isAdmin} />
      <AvailabilityConfigSection venue={venue} onUpdate={onUpdate} isAdmin={isAdmin} />
      <BookingRulesSection venue={venue} onUpdate={onUpdate} isAdmin={isAdmin} />
      <DepositConfigSection venue={venue} onUpdate={onUpdate} isAdmin={isAdmin} />
      <CommunicationTemplatesSection venue={venue} onUpdate={onUpdate} isAdmin={isAdmin} />
      <StaffSection venueId={venue.id} isAdmin={isAdmin} />
    </div>
  );
}
