'use client';

import { useCallback, useState } from 'react';
import type { VenueSettings } from './types';
import { VenueProfileSection } from './sections/VenueProfileSection';
import { OpeningHoursSection } from './sections/OpeningHoursSection';
import { AvailabilityConfigSection } from './sections/AvailabilityConfigSection';
import { BookingRulesSection } from './sections/BookingRulesSection';
import { DepositConfigSection } from './sections/DepositConfigSection';
import { StaffSection } from './sections/StaffSection';

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
      <VenueProfileSection venue={venue} onUpdate={onUpdate} isAdmin={isAdmin} />
      <OpeningHoursSection venue={venue} onUpdate={onUpdate} isAdmin={isAdmin} />
      <AvailabilityConfigSection venue={venue} onUpdate={onUpdate} isAdmin={isAdmin} />
      <BookingRulesSection venue={venue} onUpdate={onUpdate} isAdmin={isAdmin} />
      <DepositConfigSection venue={venue} onUpdate={onUpdate} isAdmin={isAdmin} />
      <StaffSection venueId={venue.id} isAdmin={isAdmin} />
    </div>
  );
}
