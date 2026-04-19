'use client';

import { useCallback, useEffect, useState } from 'react';
import { isLightPlanTier } from '@/lib/tier-enforcement';

export interface CalendarEntitlement {
  pricing_tier: string;
  calendar_count: number | null;
  active_practitioners: number;
  calendar_limit: number | null;
  unlimited: boolean;
  at_calendar_limit: boolean;
  can_add_practitioner: boolean;
}

/**
 * After `entitlementLoaded` is true: Light tier uses `can_add_practitioner`; other tiers may add freely.
 * Before load: returns false so Appointments Light does not briefly show "Add calendar".
 */
export function canAddCalendarColumn(
  entitlement: CalendarEntitlement | null,
  entitlementLoaded: boolean,
): boolean {
  if (!entitlementLoaded) return false;
  if (!entitlement) return true;
  return !isLightPlanTier(entitlement.pricing_tier) || entitlement.can_add_practitioner;
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
      if (!res.ok) return;
      const data = (await res.json()) as CalendarEntitlement;
      setEntitlement(data);
    } catch {
      // non-blocking
    } finally {
      setEntitlementLoaded(true);
    }
  }, [enabled]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { entitlement, entitlementLoaded, refresh };
}
