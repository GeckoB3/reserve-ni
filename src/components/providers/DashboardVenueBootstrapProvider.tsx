'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { OpeningHours } from '@/types/availability';

export interface DashboardVenueBootstrapValue {
  timezone: string;
  currency: string;
  openingHours: OpeningHours | null;
  publicBookingAreaMode: 'auto' | 'manual';
  noShowGraceMinutes: number;
}

const DashboardVenueBootstrapContext = createContext<DashboardVenueBootstrapValue | null>(null);

export function useDashboardVenueBootstrap(): DashboardVenueBootstrapValue | null {
  return useContext(DashboardVenueBootstrapContext);
}

export function DashboardVenueBootstrapProvider({
  value,
  children,
}: {
  value: DashboardVenueBootstrapValue | null;
  children: ReactNode;
}) {
  return (
    <DashboardVenueBootstrapContext.Provider value={value}>{children}</DashboardVenueBootstrapContext.Provider>
  );
}
