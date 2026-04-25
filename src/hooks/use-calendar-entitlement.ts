'use client';

import { useCallback, useEffect, useState } from 'react';

export interface CalendarEntitlement {
  pricing_tier: string;
  calendar_count: number | null;
  active_practitioners: number;
  calendar_limit: number | null;
  unlimited: boolean;
  at_calendar_limit: boolean;
  can_add_practitioner: boolean;
  staff_limit?: number | null;
  active_staff?: number;
  can_invite_staff?: boolean;
  unified_calendar_count?: number;
}

/**
 * After `entitlementLoaded` is true: finite tiers use `can_add_practitioner`; unlimited tiers may add freely.
 * Before load, or when entitlement cannot be loaded: returns false so the UI does not offer calendar creation
 * without knowing the venue's plan limit.
 */
export function canAddCalendarColumn(
  entitlement: CalendarEntitlement | null,
  entitlementLoaded: boolean,
): boolean {
  if (!entitlementLoaded) return false;
  if (!entitlement) return false;
  if (entitlement.unlimited) return true;
  return entitlement.can_add_practitioner;
}

export function useCalendarEntitlement(enabled: boolean) {
  const [entitlement, setEntitlement] = useState<CalendarEntitlement | null>(null);
  const [entitlementLoaded, setEntitlementLoaded] = useState(false);

  const refresh = useCallback(async () => {
    if (!enabled) {
      setEntitlement(null);
      setEntitlementLoaded(false);
      return;
    }
    try {
      const res = await fetch('/api/venue/calendar-entitlement');
      if (!res.ok) {
        setEntitlement(null);
        return;
      }
      const data = (await res.json()) as CalendarEntitlement;
      setEntitlement(data);
    } catch {
      setEntitlement(null);
    } finally {
      setEntitlementLoaded(true);
    }
  }, [enabled]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { entitlement, entitlementLoaded, refresh };
}
