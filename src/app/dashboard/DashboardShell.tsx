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

export type DashboardShellSidebarRest = Omit<DashboardSidebarProps, 'tableManagementEnabled'>;

type NavSyncContextValue = {
  setTableManagementEnabled: (value: boolean) => void;
};

const DashboardNavSyncContext = createContext<NavSyncContextValue | null>(null);

/** Call after toggling advanced table management so the left nav updates without a full reload. */
export function useDashboardTableManagementNavSync() {
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
  const [tableManagementEnabled, setTableManagementEnabled] = useState(initialTableManagementEnabled);

  useEffect(() => {
    setTableManagementEnabled(initialTableManagementEnabled);
  }, [initialTableManagementEnabled]);

  const setFlag = useCallback((value: boolean) => {
    setTableManagementEnabled(value);
  }, []);

  const ctx = useMemo(() => ({ setTableManagementEnabled: setFlag }), [setFlag]);

  return (
    <DashboardNavSyncContext.Provider value={ctx}>
      <DashboardSidebar {...sidebarRest} tableManagementEnabled={tableManagementEnabled} />
      {children}
    </DashboardNavSyncContext.Provider>
  );
}
