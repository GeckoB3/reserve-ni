'use client';

import { createContext, useContext, type ReactNode } from 'react';
import {
  DEFAULT_RESOLVED_APPOINTMENTS_FEATURE_FLAGS,
  type ResolvedAppointmentsFeatureFlags,
} from '@/lib/feature-flags';

const DEFAULT_FLAGS: ResolvedAppointmentsFeatureFlags = DEFAULT_RESOLVED_APPOINTMENTS_FEATURE_FLAGS;

const VenueFeatureFlagsContext = createContext<ResolvedAppointmentsFeatureFlags>(DEFAULT_FLAGS);

export function useVenueFeatureFlags(): ResolvedAppointmentsFeatureFlags {
  return useContext(VenueFeatureFlagsContext);
}

export function useAppointmentsFeatureFlag(
  flag: keyof ResolvedAppointmentsFeatureFlags,
): boolean {
  const flags = useVenueFeatureFlags();
  return flags[flag];
}

export function VenueFeatureFlagsProvider({
  flags,
  children,
}: {
  flags: ResolvedAppointmentsFeatureFlags;
  children: ReactNode;
}) {
  return (
    <VenueFeatureFlagsContext.Provider value={flags}>{children}</VenueFeatureFlagsContext.Provider>
  );
}
