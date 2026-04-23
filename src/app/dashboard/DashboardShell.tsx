'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { DashboardSidebar, type DashboardSidebarProps } from './DashboardSidebar';
import type { BookingModel } from '@/types/booking-models';

export type DashboardShellSidebarRest = Omit<DashboardSidebarProps, 'tableManagementEnabled'>;

type NavSyncContextValue = {
  setTableManagementEnabled: (value: boolean) => void;
  /** Align sidebar booking-model links with server-derived primary + secondaries (matches dashboard layout). */
  setNavBookingSurface: (next: { bookingModel: BookingModel; enabledModels: BookingModel[] }) => void;
};

const DashboardNavSyncContext = createContext<NavSyncContextValue | null>(null);

/** Call after toggling advanced table management so the left nav updates without a full reload. */
export function useDashboardTableManagementNavSync() {
  return useContext(DashboardNavSyncContext);
}

/** Same context as table-management sync; use after changing enabled booking models in settings. */
export function useDashboardBookingModelsNavSync() {
  return useContext(DashboardNavSyncContext);
}

/**
 * Client bridge: sidebar `table_management_enabled` comes from the server layout, but toggling the mode
 * in settings only updates the DB — `router.refresh()` may not re-run the root layout fetch. Keep a
 * client copy so nav items (Table Grid / Floor Plan) appear or hide immediately.
 */
export function DashboardShell({
  initialTableManagementEnabled,
  sidebarRest,
  children,
}: {
  initialTableManagementEnabled: boolean;
  sidebarRest: DashboardShellSidebarRest;
  children: ReactNode;
}) {
  const {
    bookingModel: serverBookingModel = 'table_reservation',
    enabledModels: serverEnabledModels = [],
    ...sidebarRestWithoutBookingNav
  } = sidebarRest;

  const [tableManagementEnabled, setTableManagementEnabled] = useState(initialTableManagementEnabled);
  const [bookingModel, setBookingModel] = useState<BookingModel>(serverBookingModel);
  const [enabledModels, setEnabledModels] = useState<BookingModel[]>(serverEnabledModels ?? []);

  useEffect(() => {
    setTableManagementEnabled(initialTableManagementEnabled);
  }, [initialTableManagementEnabled]);

  const serverBookingNavKey = useMemo(
    () => `${serverBookingModel}\u0000${JSON.stringify(serverEnabledModels ?? [])}`,
    [serverBookingModel, serverEnabledModels],
  );

  useEffect(() => {
    setBookingModel(serverBookingModel);
    setEnabledModels([...(serverEnabledModels ?? [])]);
  }, [serverBookingNavKey, serverBookingModel, serverEnabledModels]);

  const setFlag = useCallback((value: boolean) => {
    setTableManagementEnabled(value);
  }, []);

  const setNavBookingSurface = useCallback((next: { bookingModel: BookingModel; enabledModels: BookingModel[] }) => {
    setBookingModel(next.bookingModel);
    setEnabledModels(next.enabledModels);
  }, []);

  const ctx = useMemo(
    () => ({
      setTableManagementEnabled: setFlag,
      setNavBookingSurface,
    }),
    [setFlag, setNavBookingSurface],
  );

  return (
    <DashboardNavSyncContext.Provider value={ctx}>
      <DashboardSidebar
        {...sidebarRestWithoutBookingNav}
        bookingModel={bookingModel}
        enabledModels={enabledModels}
        tableManagementEnabled={tableManagementEnabled}
      />
      {children}
    </DashboardNavSyncContext.Provider>
  );
}
