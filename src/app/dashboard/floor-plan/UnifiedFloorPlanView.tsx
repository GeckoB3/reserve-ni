'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { TabBar } from '@/components/ui/dashboard/TabBar';
import { useRouter, useSearchParams } from 'next/navigation';
import { FloorPlanLiveView } from './FloorPlanLiveView';
import type { BookingModel } from '@/types/booking-models';
import type { VenueArea } from '@/types/areas';

export function UnifiedFloorPlanView({
  isAdmin,
  venueId,
  currency,
  bookingModel = 'table_reservation',
  enabledModels = [],
}: {
  isAdmin: boolean;
  venueId: string;
  currency?: string;
  bookingModel?: BookingModel;
  enabledModels?: BookingModel[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [diningAreas, setDiningAreas] = useState<VenueArea[]>([]);
  const [diningAreaId, setDiningAreaId] = useState<string | null>(null);

  const showDiningAreaChrome =
    bookingModel === 'table_reservation' && diningAreas.filter((a) => a.is_active).length > 1;

  useEffect(() => {
    if (bookingModel !== 'table_reservation') return;
    let cancelled = false;
    void fetch('/api/venue/areas')
      .then((res) => (res.ok ? res.json() : null))
      .then((j) => {
        if (cancelled || !j?.areas) return;
        setDiningAreas(j.areas as VenueArea[]);
      })
      .catch((e) => console.error('[UnifiedFloorPlanView] /api/venue/areas preload failed:', e));
    return () => {
      cancelled = true;
    };
  }, [bookingModel]);

  useEffect(() => {
    if (bookingModel !== 'table_reservation') return;
    const active = diningAreas.filter((a) => a.is_active);
    const fromUrl = searchParams.get('area');
    let fromLs: string | null = null;
    try {
      fromLs = window.localStorage.getItem(`diningArea:${venueId}`);
    } catch {
      /* ignore */
    }
    queueMicrotask(() => {
      if (active.length === 0) {
        setDiningAreaId(null);
        return;
      }
      if (active.length === 1) {
        setDiningAreaId(active[0]!.id);
        return;
      }
      const pick =
        fromUrl && active.some((a) => a.id === fromUrl)
          ? fromUrl
          : fromLs && active.some((a) => a.id === fromLs)
            ? fromLs
            : active[0]!.id;
      setDiningAreaId(pick);
    });
  }, [bookingModel, diningAreas, searchParams, venueId]);

  const effectiveDiningAreaId = bookingModel === 'table_reservation' ? diningAreaId : null;

  const setDiningAreaFilter = useCallback(
    (id: string) => {
      setDiningAreaId(id);
      try {
        window.localStorage.setItem(`diningArea:${venueId}`, id);
      } catch {
        /* ignore */
      }
      const next = new URLSearchParams(searchParams.toString());
      next.set('area', id);
      router.replace(`/dashboard/floor-plan?${next}`, { scroll: false });
    },
    [router, searchParams, venueId],
  );

  const editLayoutHref =
    effectiveDiningAreaId && showDiningAreaChrome
      ? `/dashboard/availability?tab=table&fp=layout&area=${encodeURIComponent(effectiveDiningAreaId)}`
      : '/dashboard/availability?tab=table&fp=layout';

  const areaTabs = useMemo(
    () => diningAreas.filter((a) => a.is_active).map((a) => ({ id: a.id, label: a.name })),
    [diningAreas],
  );

  return (
    <div className="space-y-2 sm:space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        {showDiningAreaChrome && effectiveDiningAreaId ? (
          <TabBar tabs={areaTabs} value={effectiveDiningAreaId} onChange={setDiningAreaFilter} />
        ) : null}
        <div
          className={`flex items-center ${showDiningAreaChrome ? 'sm:justify-end' : ''} ${!showDiningAreaChrome && !isAdmin ? 'hidden' : ''}`}
        >
          {isAdmin && (
            <Link
              href={editLayoutHref}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-amber-600 sm:min-h-0 sm:px-3 sm:py-2"
            >
              Edit Layout
            </Link>
          )}
        </div>
      </div>
      <FloorPlanLiveView
        isAdmin={isAdmin}
        venueId={venueId}
        currency={currency}
        bookingModel={bookingModel}
        enabledModels={enabledModels}
        diningAreaId={effectiveDiningAreaId}
      />
    </div>
  );
}
