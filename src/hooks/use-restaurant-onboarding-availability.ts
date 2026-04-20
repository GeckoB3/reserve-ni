'use client';

import { useCallback, useEffect, useState } from 'react';
import type { VenueServiceRow } from '@/app/dashboard/availability/ServicesTab';

type VenueAreaListItem = { id: string; is_active: boolean };

/**
 * Resolves dining area + services for restaurant onboarding so steps can mirror
 * `/dashboard/availability` (per-area services, capacity, durations, rules).
 */
export function useRestaurantOnboardingAvailability() {
  const [selectedAreaId, setSelectedAreaId] = useState<string | null>(null);
  const [services, setServices] = useState<VenueServiceRow[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      let areaId: string | null = null;
      try {
        const ar = await fetch('/api/venue/areas');
        if (ar.ok) {
          const data = (await ar.json()) as { areas?: VenueAreaListItem[] };
          const active = (data.areas ?? []).filter((a) => a.is_active);
          areaId = active[0]?.id ?? null;
        }
      } catch {
        /* ignore */
      }

      if (!areaId) {
        try {
          const svRes = await fetch('/api/venue/services');
          if (svRes.ok) {
            const body = (await svRes.json()) as { services?: Array<{ area_id?: string | null }> };
            const withArea = (body.services ?? []).find((s) => s.area_id);
            areaId = withArea?.area_id ?? null;
          }
        } catch {
          /* ignore */
        }
      }

      setSelectedAreaId(areaId);

      const svcUrl = areaId
        ? `/api/venue/services?area_id=${encodeURIComponent(areaId)}`
        : '/api/venue/services';
      const svcRes = await fetch(svcUrl);
      if (svcRes.ok) {
        const body = (await svcRes.json()) as { services?: VenueServiceRow[] };
        setServices(body.services ?? []);
      } else {
        setServices([]);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { selectedAreaId, services, setServices, loading, refresh };
}
